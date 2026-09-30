import { test as base, expect } from '@playwright/test';

/** Pairing state the fake `pair` function hands out; the code shows as ABCD-1234. */
export const PAIR = { id: 'pair-1', code: 'ABCD1234', secret: 's', expires_at: '2099-01-01T00:00:00Z' };

/**
 * Live tests never reach the real Supabase project (it's production). Every request to it
 * is answered here, edge functions get canned replies, and realtime sockets are closed.
 */
export const test = base.extend<{ supabaseCalls: string[] }>({
  supabaseCalls: async ({ page }, use) => {
    const calls: string[] = [];
    await page.routeWebSocket(/supabase\.co/, (ws) => ws.close());
    await page.route(/supabase\.co/, (route) => {
      const url = new URL(route.request().url());
      calls.push(url.pathname);
      const fn = /\/functions\/v1\/([\w-]+)/.exec(url.pathname)?.[1];
      if (fn === 'pair') {
        const body = route.request().postDataJSON() ?? {};
        return route.fulfill({ json: body.action === 'start' ? PAIR : { state: 'pending' } });
      }
      if (fn === 'request-code') return route.fulfill({ json: { ok: true } });
      if (url.pathname.startsWith('/auth/')) return route.fulfill({ status: 204 });
      return route.fulfill({ json: [] });
    });
    await use(calls);
  },
});

export { expect };
