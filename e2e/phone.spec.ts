import { APP_VERSION } from '../src/lib/version';
import { expect, test } from './fixtures';

test.describe('phone app', () => {
  test('Android registers both accounts and a push tap opens the matching chat', async ({ page, supabaseCalls }) => {
    const email = 'home@example.com';
    const other = 'work@example.com';
    const chatId = '11111111-2222-4333-8444-555555555555';
    const installationId = '22222222-2222-4222-8222-222222222222';
    const chat = { id: chatId, agent_id: 'agent', node_id: 'node', title: 'Push target', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    await page.addInitScript(({ email, other, chatId, installationId }) => {
      localStorage.setItem('neptune.accounts', JSON.stringify([email, other]));
      localStorage.setItem('neptune.account', email);
      for (const account of [email, other]) {
        localStorage.setItem(`neptune-auth:${account}`, JSON.stringify({
          access_token: 'test-access-token', refresh_token: 'test-refresh-token', expires_at: 9999999999,
          token_type: 'bearer', user: { id: account, email: account },
        }));
      }
      const native = window as unknown as { isTauri: boolean; __TAURI_OS_PLUGIN_INTERNALS__: object; __TAURI_INTERNALS__: object; pushCalls: { command: string; args: unknown }[] };
      native.isTauri = true;
      native.__TAURI_OS_PLUGIN_INTERNALS__ = { platform: 'android' };
      native.pushCalls = [];
      let pending: unknown = { email: other, chatId };
      native.__TAURI_INTERNALS__ = {
        invoke: async (command: string, args: unknown) => {
          native.pushCalls.push({ command, args });
          if (command === 'push_token') return { token: 'fake-fcm-token-with-twenty-characters', installationId };
          if (command === 'push_open') {
            const open = pending;
            pending = null;
            return { open };
          }
          if (command === 'plugin:notification|is_permission_granted') return true;
          if (command === 'plugin:app|version') return '0.1.2';
          return null;
        },
      };
    }, { email, other, chatId, installationId });
    await page.route('https://api.github.com/**', (route) => route.fulfill({ status: 404 }));
    await page.route(/supabase\.co\/rest\/v1\//, (route) => {
      const url = new URL(route.request().url());
      supabaseCalls.push(url.pathname);
      if (url.pathname.endsWith('/chats')) return route.fulfill({ json: url.searchParams.has('id') ? chat : [chat] });
      if (url.pathname.endsWith('/agents')) return route.fulfill({ json: [{ id: 'agent', node_id: 'node', name: 'Codex', kind: 'codex', online: false }] });
      if (url.pathname.endsWith('/nodes')) return route.fulfill({ json: [{ id: 'node', name: 'Work', operator_email: other }] });
      if (url.pathname.endsWith('/rpc/register_push_device')) return route.fulfill({ status: 204 });
      return route.fulfill({ json: [] });
    });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/?mode=phone');
    await expect(page.getByRole('button', { name: 'Back to chats' })).toBeVisible();
    await expect(page.getByText('// Push target')).toBeVisible();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('neptune.account'))).toBe(other);
    await expect.poll(() => supabaseCalls.filter((path) => path.endsWith('/rpc/register_push_device')).length).toBeGreaterThanOrEqual(2);
    await expect.poll(() => page.evaluate((chatId) => {
      const native = window as unknown as { pushCalls: { command: string; args: { context?: { chatId?: string } } }[] };
      return native.pushCalls.some((call) => call.command === 'push_context' && call.args?.context?.chatId === chatId);
    }, chatId)).toBe(true);
    await page.getByRole('button', { name: 'Back to chats' }).click();
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await expect(page.getByText(`Neptune v${APP_VERSION}`, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('neptune.accounts') || '[]'))).toEqual([email]);
    expect(supabaseCalls).toContain('/rest/v1/push_devices');
    expect(errors).toEqual([]);
  });

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
  test('renames and deletes chats from the list and from inside a chat', async ({ page, supabaseCalls }) => {
    const email = 'home@example.com';
    const at = new Date().toISOString();
    const chat = (id: string, title: string) => ({ id, agent_id: 'agent', node_id: 'node', title, preview: null, last_sender: null, created_at: at, updated_at: at });
    let chats = [chat('chat-1', 'Old name'), chat('chat-2', 'Scratch')];
    const writes: { method: string; id: string | null; body: unknown }[] = [];
    await page.addInitScript((email) => {
      localStorage.setItem('neptune.accounts', JSON.stringify([email]));
      localStorage.setItem('neptune.account', email);
      localStorage.setItem(`neptune-auth:${email}`, JSON.stringify({
        access_token: 'test-access-token', refresh_token: 'test-refresh-token', expires_at: 9999999999,
        token_type: 'bearer', user: { id: email, email },
      }));
    }, email);
    await page.route('https://api.github.com/**', (route) => route.fulfill({ status: 404 }));
    await page.route(/supabase\.co\/rest\/v1\//, (route) => {
      const req = route.request();
      const url = new URL(req.url());
      supabaseCalls.push(url.pathname);
      if (url.pathname.endsWith('/chats')) {
        const id = url.searchParams.get('id')?.replace('eq.', '') ?? null;
        if (req.method() === 'PATCH') {
          writes.push({ method: 'PATCH', id, body: req.postDataJSON() });
          chats = chats.map((c) => (c.id === id ? { ...c, ...req.postDataJSON() } : c));
          return route.fulfill({ json: chats.find((c) => c.id === id) });
        }
        if (req.method() === 'DELETE') {
          writes.push({ method: 'DELETE', id, body: null });
          chats = chats.filter((c) => c.id !== id);
          return route.fulfill({ status: 204 });
        }
        return route.fulfill({ json: chats });
      }
      if (url.pathname.endsWith('/agents')) return route.fulfill({ json: [{ id: 'agent', node_id: 'node', name: 'Claude', kind: 'claude', online: false }] });
      if (url.pathname.endsWith('/nodes')) return route.fulfill({ json: [{ id: 'node', name: 'Home', operator_email: email }] });
      return route.fulfill({ json: [] });
    });
    await page.goto('/?mode=phone');

    // A long press opens the sheet instead of the chat.
    const row = page.locator('.chat-row', { hasText: 'Old name' });
    await row.dispatchEvent('pointerdown');
    await expect(page.getByRole('dialog', { name: 'Chat options' })).toBeVisible();
    await row.dispatchEvent('pointerup');
    await expect(page.getByRole('button', { name: 'Back to chats' })).toHaveCount(0);

    const field = page.getByLabel('Chat name');
    await expect(field).toHaveValue('Old name');
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
    await field.fill('  Fixing   the build ');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('.chat-row', { hasText: 'Fixing the build' })).toBeVisible();
    expect(writes).toContainEqual({ method: 'PATCH', id: 'chat-1', body: { title: 'Fixing the build' } });

    // Delete needs a second tap.
    await page.locator('.chat-row', { hasText: 'Scratch' }).click({ button: 'right' });
    await page.getByRole('button', { name: 'Delete chat' }).click();
    expect(writes.some((w) => w.method === 'DELETE')).toBe(false);
    await page.getByRole('button', { name: 'Tap again to delete' }).click();
    await expect(page.locator('.chat-row', { hasText: 'Scratch' })).toHaveCount(0);
    expect(writes).toContainEqual({ method: 'DELETE', id: 'chat-2', body: null });

    // Inside a chat, the menu renames it too.
    await page.locator('.chat-row', { hasText: 'Fixing the build' }).click();
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await page.getByRole('button', { name: 'Rename chat' }).click();
    await page.getByLabel('Chat name').fill('Release prep');
    await page.getByLabel('Chat name').press('Enter');
    await expect(page.getByText('// Release prep')).toBeVisible();
  });
});
