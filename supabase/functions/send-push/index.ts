import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { buildPushMessage, isExpiredToken, retryDelaySeconds } from './payload.ts';

interface ServiceAccount { project_id: string; client_email: string; private_key: string }
interface Delivery { id: number; message_id: string; device_id: string; attempts: number; locked_until: string }
interface Reply {
  id: string; body: string; chat_id: string; created_at: string; sender: string;
  nodes: { operator_email: string; name: string };
  chats: { agents: { name: string } };
}

const database = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
let cachedToken: { token: string; expires: number } | null = null;
let fetchingToken: Promise<string> | null = null;

const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const encode = (value: unknown) => base64url(new TextEncoder().encode(JSON.stringify(value)));

async function accessToken(account: ServiceAccount): Promise<string> {
  if (cachedToken && cachedToken.expires > Date.now() + 60_000) return cachedToken.token;
  if (fetchingToken) return fetchingToken;
  fetchingToken = (async () => {
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
      iss: account.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
    })}`;
    const pem = account.private_key.replace(/-----[^-]+-----|\s/g, '');
    const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned)));
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${base64url(signature)}` }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Firebase authorization failed (${response.status})`);
    const result = await response.json();
    if (!result.access_token) throw new Error('Firebase authorization returned no access token');
    cachedToken = { token: result.access_token, expires: Date.now() + Number(result.expires_in || 3600) * 1000 };
    return cachedToken.token;
  })();
  try { return await fetchingToken; } finally { fetchingToken = null; }
}

async function authorized(request: Request) {
  const secret = Deno.env.get('NEPTUNE_PUSH_SECRET');
  const supplied = request.headers.get('x-neptune-push-secret');
  if (!secret || !supplied) return false;
  const hashes = await Promise.all([secret, supplied].map(async (s) => new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)),
  )));
  let diff = 0;
  for (let i = 0; i < hashes[0].length; i++) diff |= hashes[0][i] ^ hashes[1][i];
  return diff === 0;
}

async function deliver(row: Delivery, account: ServiceAccount, token: string) {
  try {
    const [device, reply] = await Promise.all([
      database.from('push_devices').select('token').eq('id', row.device_id).maybeSingle(),
      database.from('messages').select('id, body, chat_id, created_at, sender, nodes!inner(operator_email, name), chats!inner(agents!inner(name))')
        .eq('id', row.message_id).maybeSingle(),
    ]);
    if (device.error || reply.error) throw new Error('Could not read push delivery');
    if (!device.data || !reply.data) return;
    const message = reply.data as unknown as Reply;
    const payload = buildPushMessage({
      token: device.data.token, messageId: message.id, chatId: message.chat_id,
      email: message.nodes.operator_email,
      title: message.sender === 'agent' ? `${message.chats.agents.name} · ${message.nodes.name}` : 'Neptune',
      body: message.body, createdAt: message.created_at,
    });
    if (payload) {
      const response = await fetch(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload), signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        if (isExpiredToken(error)) {
          // Don't delete a token refreshed while this request was in flight.
          const removed = await database.from('push_devices').delete().eq('id', row.device_id).eq('token', device.data.token);
          if (removed.error) throw new Error('Could not remove expired push token');
          return;
        }
        if (response.status === 401) cachedToken = null;
        throw new Error(`FCM delivery failed (${response.status})`);
      }
    }
    const sent = await database.from('push_deliveries').update({ sent_at: new Date().toISOString(), locked_until: null, last_error: null })
      .eq('id', row.id).eq('locked_until', row.locked_until);
    if (sent.error) throw new Error('Could not record push delivery');
  } catch (error) {
    const retried = await database.from('push_deliveries').update({
      locked_until: null, available_at: new Date(Date.now() + retryDelaySeconds(row.attempts) * 1000).toISOString(),
      last_error: error instanceof Error ? error.message : 'Push delivery failed',
    }).eq('id', row.id).eq('locked_until', row.locked_until);
    if (retried.error) console.error('Could not reschedule push delivery', row.id);
  }
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!(await authorized(request))) return new Response('Unauthorized', { status: 401 });
  try {
    const raw = Deno.env.get('FCM_SERVICE_ACCOUNT');
    if (!raw) return new Response('Firebase is not configured', { status: 503 });
    const account = JSON.parse(raw) as ServiceAccount;
    if (!account.project_id || !account.client_email || !account.private_key) throw new Error('Invalid Firebase credentials');
    // Authorize before claiming, so credential failures do not consume delivery attempts.
    const token = await accessToken(account);
    const { data, error } = await database.rpc('claim_push_batch');
    if (error) throw new Error('Could not claim push deliveries');
    const rows = (data || []) as Delivery[];
    for (let i = 0; i < rows.length; i += 5) {
      await Promise.all(rows.slice(i, i + 5).map((row) => deliver(row, account, token)));
    }
    return Response.json({ processed: rows.length });
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Push sender failed');
    return new Response('Push sender unavailable; queued deliveries will retry', { status: 503 });
  }
});
