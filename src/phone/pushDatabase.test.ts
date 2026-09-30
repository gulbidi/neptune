import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** Exercise the actual migration in embedded Postgres, with external extensions stubbed. */
describe('push database authorization and delivery queue', () => {
  let db: PGlite;
  const owner = '11111111-1111-4111-8111-111111111111';
  const other = '22222222-2222-4222-8222-222222222222';
  const bridge = '33333333-3333-4333-8333-333333333333';
  const install = '44444444-4444-4444-8444-444444444444';
  const node = '55555555-5555-4555-8555-555555555555';
  const chat = '66666666-6666-4666-8666-666666666666';

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema vault; create schema net; create schema cron;
      create table auth.users(id uuid primary key, email text);
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
      create function public.my_email() returns text language sql as $$ select current_setting('test.email', true) $$;
      grant usage on schema auth to authenticated;
      grant execute on function auth.uid(), public.my_email() to authenticated;
      create table vault.decrypted_secrets(name text, decrypted_secret text);
      create function net.http_post(url text, headers jsonb, body jsonb, timeout_milliseconds integer)
        returns bigint language sql as $$ select 1::bigint $$;
      create function cron.schedule(name text, schedule text, command text)
        returns bigint language sql as $$ select 1::bigint $$;
      create table nodes(id uuid primary key, operator_email text);
      create table messages(id uuid primary key, node_id uuid references nodes(id), chat_id uuid, sender text, status text);
      insert into nodes values ('${node}', 'owner@example.com');
      insert into auth.users values ('${owner}', 'owner@example.com'), ('${other}', 'other@example.com'), ('${bridge}', 'bridge@example.com');
    `);
    const migration = readFileSync(new URL('../../supabase/migrations/20260930010000_push.sql', import.meta.url), 'utf8');
    await db.exec(migration.replace(/^create extension[^;]+;/gm, ''));
  }, 30_000);
  afterAll(async () => { await db?.close(); });

  async function asUser(id: string, email: string, action: () => Promise<unknown>) {
    await db.query(`select set_config('test.uid', $1, false), set_config('test.email', $2, false)`, [id, email]);
    await db.exec('set role authenticated');
    try { return await action(); } finally { await db.exec('reset role'); }
  }

  it('registers only an operator and hides their tokens from other accounts', async () => {
    await asUser(owner, 'owner@example.com', () => db.query('select register_push_device($1, $2)', [install, 'valid-token-with-twenty-characters']));
    await expect(asUser(bridge, 'bridge@example.com', () => db.query('select register_push_device($1, $2)', [install, 'bridge-token-with-twenty-characters']))).rejects.toThrow('Only a signed-in operator');
    const result = await asUser(other, 'other@example.com', () => db.query('select token from push_devices')) as { rows: unknown[] };
    expect(result.rows).toHaveLength(0);
    await expect(asUser(owner, 'owner@example.com', () => db.query('select claim_push_batch()'))).rejects.toThrow('permission denied');
  });

  it('queues only replies, then leases each delivery once', async () => {
    await db.exec(`
      insert into messages values ('77777777-7777-4777-8777-777777777777', '${node}', '${chat}', 'user', 'queued');
      insert into messages values ('88888888-8888-4888-8888-888888888888', '${node}', '${chat}', 'agent', 'sent');
      insert into messages values ('99999999-9999-4999-8999-999999999999', '${node}', '${chat}', 'system', 'sent');
    `);
    const first = await db.query<{ attempts: number }>('select * from claim_push_batch()');
    expect(first.rows).toHaveLength(2);
    expect(first.rows.every((row) => row.attempts === 1)).toBe(true);
    expect((await db.query('select * from claim_push_batch()')).rows).toHaveLength(0);
  });

  it('refreshes a token in place and sign-out removes pending deliveries', async () => {
    await asUser(owner, 'owner@example.com', () => db.query('select register_push_device($1, $2)', [install, 'refreshed-token-with-twenty-characters']));
    expect((await db.query<{ token: string }>('select token from push_devices')).rows).toEqual([{ token: 'refreshed-token-with-twenty-characters' }]);
    await asUser(other, 'other@example.com', () => db.query('delete from push_devices'));
    expect((await db.query('select * from push_devices')).rows).toHaveLength(1);
    await asUser(owner, 'owner@example.com', () => db.query('delete from push_devices'));
    expect((await db.query('select * from push_deliveries')).rows).toHaveLength(0);
  });
});
