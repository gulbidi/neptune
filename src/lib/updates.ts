import { getVersion } from '@tauri-apps/api/app';
import { GITHUB_REPO } from './config';
import { inTauri } from './platform';

export interface PhoneUpdate {
  version: string;
  url: string;
  notes: string;
}

export function compareVersions(a: string, b: string) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return Math.sign(d);
  }
  return 0;
}

export async function appVersion() {
  return inTauri() ? getVersion() : '0.0.0-dev';
}

/** Android can't self-update silently; we find the newest APK on GitHub Releases. */
export async function checkPhoneUpdate(): Promise<PhoneUpdate | null> {
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) return null;
  const rel = await res.json();
  const latest = String(rel.tag_name || '').replace(/^v/, '');
  const current = await appVersion();
  if (!latest || current.includes('dev') || compareVersions(latest, current) <= 0) return null;
  const apk = (rel.assets || []).find((a: { name: string }) => a.name.endsWith('.apk'));
  if (!apk) return null;
  return { version: latest, url: apk.browser_download_url, notes: rel.body || '' };
}
