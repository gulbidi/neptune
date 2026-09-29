import { openUrl } from '@tauri-apps/plugin-opener';
import { inTauri } from './platform';

export function openExternal(url: string) {
  if (inTauri()) return openUrl(url);
  window.open(url, '_blank', 'noopener');
}
