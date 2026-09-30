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
    expect(errors).toEqual([]);
  });
});
