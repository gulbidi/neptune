import { invoke } from '@tauri-apps/api/core';
import { platform } from '@tauri-apps/plugin-os';
import { useEffect } from 'react';
import { inTauri } from '../lib/platform';
import { ensureNotifyPermission } from '../lib/notify';
import { clientFor, listAccounts } from './accounts';

export interface PushTarget { email: string; chatId: string }
interface PushToken { token: string; installationId: string }

export const usesNativePush = () => inTauri() && platform() === 'android';

/** Treat tap payloads as untrusted navigation hints; RLS still authorizes the chat. */
export function parsePushTarget(value: unknown, accounts: string[]): PushTarget | null {
  if (!value || typeof value !== 'object') return null;
  const { email, chatId } = value as Partial<PushTarget>;
  if (typeof email !== 'string' || !accounts.includes(email) || typeof chatId !== 'string') return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(chatId)) return null;
  return { email, chatId };
}

let contextWrites = Promise.resolve();
let registrationWrites = Promise.resolve();
const revoking = new Set<string>();
export const allowPushRegistration = (email: string) => revoking.delete(email);

function serializeRegistration(action: () => Promise<void>) {
  const next = registrationWrites.catch(() => {}).then(action);
  registrationWrites = next;
  return next;
}
export function setPushContext(email: string | null, chatId: string | null) {
  if (!usesNativePush()) return;
  contextWrites = contextWrites.catch(() => {}).then(() => invoke<void>('push_context', {
    context: { accounts: listAccounts(), email, chatId },
  }));
  // A teardown should not produce an unhandled rejection.
  contextWrites.catch(() => {});
}

/** Unregister before losing the session so a signed-out account cannot keep alerting. */
export async function unregisterPush(email: string) {
  if (!usesNativePush()) return;
  const installationId = localStorage.getItem('neptune.push.installation');
  if (!installationId) return;
  revoking.add(email);
  try {
    await serializeRegistration(async () => {
      const { error } = await clientFor(email).from('push_devices').delete().eq('installation_id', installationId);
      if (error) throw new Error('Connect to the internet to sign out and turn off notifications for this account.');
    });
  } catch (error) {
    revoking.delete(email);
    throw error;
  }
}

/** Native FCM owns Android alerts; Realtime remains responsible for live chat UI. */
export function usePush(accounts: string[], onOpen: (target: PushTarget) => void, onError: (text: string) => void) {
  const accountKey = JSON.stringify(accounts);
  useEffect(() => {
    if (!usesNativePush()) return;
    const emails = JSON.parse(accountKey) as string[];
    let disposed = false;
    let syncing = false;
    let checkingOpen = false;
    let reported = false;
    const sync = async () => {
      if (disposed || syncing || !emails.length) return;
      syncing = true;
      try {
        if (!(await ensureNotifyPermission()) || disposed) return;
        const device = await invoke<PushToken>('push_token');
        localStorage.setItem('neptune.push.installation', device.installationId);
        for (const email of emails) {
          if (disposed || !listAccounts().includes(email)) continue;
          await serializeRegistration(async () => {
            if (disposed || revoking.has(email) || !listAccounts().includes(email)) return;
            const client = clientFor(email);
            const { data } = await client.auth.getSession();
            if (!data.session || revoking.has(email)) return;
            const { error } = await client.rpc('register_push_device', {
              p_installation: device.installationId, p_token: device.token,
            });
            if (error) throw new Error('Could not enable push notifications. Check your connection and reopen Neptune.');
          });
        }
      } catch (error) {
        if (!disposed && !reported) {
          reported = true;
          onError(error instanceof Error ? error.message : 'Could not enable push notifications.');
        }
      } finally {
        syncing = false;
      }
    };
    const checkOpen = async () => {
      if (disposed || checkingOpen || document.visibilityState !== 'visible') return;
      checkingOpen = true;
      try {
        const result = await invoke<{ open: unknown }>('push_open');
        const target = parsePushTarget(result.open, listAccounts());
        if (!disposed && target) onOpen(target);
      } finally {
        checkingOpen = false;
      }
    };
    const resume = () => {
      if (document.visibilityState === 'visible') {
        void sync();
        void checkOpen().catch(() => {});
      }
    };
    const subscriptions = emails.map((email) => clientFor(email).auth.onAuthStateChange(() => {
      // Auth callbacks run under Supabase's session lock.
      queueMicrotask(() => void sync());
    }).data.subscription);
    resume();
    const refresh = window.setInterval(() => void sync(), 60_000);
    const taps = window.setInterval(() => void checkOpen().catch(() => {}), 1500);
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('online', resume);
    return () => {
      disposed = true;
      subscriptions.forEach((s) => s.unsubscribe());
      window.clearInterval(refresh);
      window.clearInterval(taps);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('online', resume);
    };
  }, [accountKey, onOpen, onError]);
}
