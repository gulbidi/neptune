-- Durable Android push delivery. The installed bridge still only inserts messages.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists supabase_vault with schema vault;

create table public.push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  installation_id uuid not null,
  token text not null check (length(token) between 20 and 4096),
  updated_at timestamptz not null default now(),
  unique (user_id, installation_id),
  unique (user_id, token)
);
alter table public.push_devices enable row level security;
revoke all on public.push_devices from anon, authenticated;
grant all on public.push_devices to service_role;
grant select, delete on public.push_devices to authenticated;
create policy "operators read their push devices" on public.push_devices
  for select to authenticated using (user_id = auth.uid());
create policy "operators unregister their push devices" on public.push_devices
  for delete to authenticated using (user_id = auth.uid());

create function public.register_push_device(p_installation uuid, p_token text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not exists (select 1 from nodes where operator_email = public.my_email()) then
    raise exception 'Only a signed-in operator can register a phone';
  end if;
  -- Reinstalling must not leave duplicate registrations for the same token.
  delete from push_devices where user_id = auth.uid() and token = p_token and installation_id <> p_installation;
  insert into push_devices (user_id, installation_id, token)
  values (auth.uid(), p_installation, p_token)
  on conflict (user_id, installation_id) do update set token = excluded.token, updated_at = now();
end $$;
revoke all on function public.register_push_device(uuid, text) from public;
grant execute on function public.register_push_device(uuid, text) to authenticated;

create table public.push_deliveries (
  id bigint generated always as identity primary key,
  message_id uuid not null references public.messages(id) on delete cascade,
  device_id uuid not null references public.push_devices(id) on delete cascade,
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  locked_until timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (message_id, device_id)
);
alter table public.push_deliveries enable row level security;
revoke all on public.push_deliveries from anon, authenticated;
grant all on public.push_deliveries to service_role;
grant usage, select on sequence public.push_deliveries_id_seq to service_role;
create index push_deliveries_pending_idx on public.push_deliveries (available_at) where sent_at is null;

-- URL and secret are provisioned in Vault; no credentials appear in migrations.
create function public.wake_push_sender() returns void
language plpgsql security definer set search_path = public, vault, net as $$
declare endpoint text; secret text;
begin
  select decrypted_secret into endpoint from vault.decrypted_secrets where name = 'neptune_push_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'neptune_push_secret';
  if endpoint is null or secret is null then return; end if;
  perform net.http_post(url := endpoint,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-neptune-push-secret', secret),
    body := '{}'::jsonb, timeout_milliseconds := 5000);
end $$;
revoke all on function public.wake_push_sender() from public, anon, authenticated;

create function public.queue_reply_push() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.sender not in ('agent', 'system') or new.status <> 'sent' then return new; end if;
  insert into push_deliveries (message_id, device_id)
  select new.id, d.id from nodes n
    join auth.users u on lower(u.email) = n.operator_email
    join push_devices d on d.user_id = u.id
    where n.id = new.node_id and d.updated_at > now() - interval '90 days';
  if found then
    -- A temporary push outage must never fail the agent's reply transaction.
    begin perform public.wake_push_sender();
    exception when others then raise warning 'Push wake failed; scheduled retry will drain the queue'; end;
  end if;
  return new;
end $$;
revoke all on function public.queue_reply_push() from public, anon, authenticated;
create trigger messages_queue_push after insert on public.messages
  for each row execute function public.queue_reply_push();

create function public.claim_push_batch() returns setof public.push_deliveries
language sql security definer set search_path = public as $$
  update push_deliveries set locked_until = now() + interval '90 seconds', attempts = attempts + 1
  where id in (
    select id from push_deliveries
    where sent_at is null and attempts < 8 and available_at <= now()
      and created_at > now() - interval '1 hour'
      and (locked_until is null or locked_until < now())
    order by available_at limit 25 for update skip locked
  ) returning *;
$$;
revoke all on function public.claim_push_batch() from public, anon, authenticated;
grant execute on function public.claim_push_batch() to service_role;

-- Covers failed webhooks and transient Firebase/network errors without polling phones.
select cron.schedule('neptune-push-retry', '* * * * *', 'select public.wake_push_sender()');
select cron.schedule('neptune-push-cleanup', '13 3 * * *',
  $$delete from public.push_deliveries where created_at < now() - interval '7 days';
    delete from public.push_devices where updated_at < now() - interval '90 days'$$);
