import { APP_VERSION } from '../src/lib/version';
import { expect, test } from './fixtures';

test.describe('desktop bridge', () => {
  test('pairing screen shows the code from the backend', async ({ page, supabaseCalls }) => {
    await page.goto('/?mode=bridge&pair');
    await expect(page.getByRole('heading', { name: 'PAIR THIS PC' })).toBeVisible();
    await expect(page.getByText('ABCD-1234')).toBeVisible();
    await expect(page.getByText(/PREVIEW · new code in/)).toBeVisible();
    expect(supabaseCalls).toContain('/functions/v1/pair');
  });

  test('console renders the preview node', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/?mode=bridge');
    await expect(page.getByRole('banner').getByText('NEPTUNE')).toBeVisible();
    await expect(page.getByText(/Listening for transmissions/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Stop all/ })).toBeDisabled();
    await expect(page.getByRole('button', { name: /Config/ })).toBeEnabled();
    await expect(page.getByText(`v${APP_VERSION}`, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Config/ }).click();
    await expect(page.getByText('Next update check')).toBeVisible();
    await expect(page.locator('.setting').filter({ hasText: 'Next update check' }).locator('code')).toHaveText(/0[23]:[0-5][0-9]:[0-5][0-9]/);
    await expect(page.getByText('Last update check')).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test('transmission feed scrolls without cutting off the latest row', async ({ page, supabaseCalls }) => {
  test.setTimeout(90000);
  let count = 30;
  await page.route(/supabase\.co\/rest\/v1\/messages/, (route) => {
    supabaseCalls.push('/rest/v1/messages');
    return route.fulfill({ json: Array.from({ length: count }, (_, i) => ({
      id: `message-${i}`, chat_id: 'chat', node_id: 'node', sender: 'agent', status: 'sent',
      body: `Transmission ${i}`, created_at: new Date(1700000000000 + i * 1000).toISOString(), meta: {},
    })).reverse() });
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/?mode=bridge');
  const feed = page.getByLabel('Transmission feed messages');
  await expect(feed.locator('.feed-row')).toHaveCount(30);
  await expect.poll(() => feed.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop)).toBeLessThan(2);
  const bottomFits = await feed.evaluate((el) => el.lastElementChild!.getBoundingClientRect().bottom <= el.getBoundingClientRect().bottom);
  expect(bottomFits).toBe(true);
  await feed.evaluate((el) => { el.scrollTop = 0; el.dispatchEvent(new Event('scroll')); });
  count = 31;
  // The fallback poll loads new messages without moving a reader away from older rows.
  await expect(feed.locator('.feed-row')).toHaveCount(31, { timeout: 40000 });
  expect(await feed.evaluate((el) => el.scrollTop)).toBe(0);
  await feed.evaluate((el) => { el.scrollTop = el.scrollHeight; el.dispatchEvent(new Event('scroll')); });
  count = 32;
  await expect(feed.locator('.feed-row')).toHaveCount(32, { timeout: 40000 });
  await expect.poll(() => feed.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop)).toBeLessThan(2);
});
