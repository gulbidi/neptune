import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { inTauri } from './platform';

let granted: boolean | null = null;

export async function ensureNotifyPermission() {
  if (!inTauri()) return false;
  granted = await isPermissionGranted();
  if (!granted) granted = (await requestPermission()) === 'granted';
  return granted;
}

export async function notify(title: string, body: string) {
  if (!inTauri()) return;
  if (granted === null) await ensureNotifyPermission();
  if (!granted) return;
  const text = body.replace(/[#*_`>]/g, '').replace(/\s+/g, ' ').trim();
  sendNotification({ title, body: text.length > 180 ? `${text.slice(0, 177)}…` : text });
}
