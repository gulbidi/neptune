import { expect, test } from './fixtures';

test.describe('phone app', () => {
  test('signs in: email, then the code the PC shows', async ({ page, supabaseCalls }) => {
    await page.goto('/?mode=phone');
    await expect(page.getByRole('heading', { name: 'NEPTUNE' })).toBeVisible();

    const request = page.getByRole('button', { name: 'Request access' });
    await expect(request).toBeDisabled();
    await page.getByPlaceholder('operator@gmail.com').fill('test@example.com');
    await request.click();

    await expect(page.getByText('is showing a QR code')).toBeVisible();
    expect(supabaseCalls).toContain('/functions/v1/request-code');

    // The camera scanner only exists in the Android app, so the browser types the code.
    await expect(page.getByRole('button', { name: 'Scan QR code' })).toHaveCount(0);
    await page.locator('input.code').fill('12ab34');
    await expect(page.locator('input.code')).toHaveValue('1234');
    await page.locator('input.code').fill('123456');
    await expect(page.getByRole('button', { name: 'Authenticate' })).toBeVisible();

    await page.getByRole('button', { name: 'Use a different email' }).click();
    await expect(page.getByPlaceholder('operator@gmail.com')).toBeVisible();
  });
});
