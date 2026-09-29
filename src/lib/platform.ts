import { isTauri } from '@tauri-apps/api/core';
import { platform } from '@tauri-apps/plugin-os';

export type Mode = 'phone' | 'bridge';

/** Android/iOS run the chat client; desktop runs the Claude bridge. */
export function getMode(): Mode {
  const forced = new URLSearchParams(location.search).get('mode');
  if (forced === 'phone' || forced === 'bridge') return forced;
  if (!isTauri()) return 'phone';
  const p = platform();
  return p === 'android' || p === 'ios' ? 'phone' : 'bridge';
}

export const inTauri = isTauri;
