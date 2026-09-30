import { describe, expect, it } from 'vitest';
import { buildPushMessage, isExpiredToken, notificationPreview, retryDelaySeconds } from '../../supabase/functions/send-push/payload';

describe('FCM delivery', () => {
  const now = Date.parse('2026-09-30T12:00:00Z');
  const input = { token: 'device-token', messageId: 'reply', chatId: 'chat', email: 'home@example.com', title: 'Codex · Home', body: '**Done**\n\nAll checks passed.', createdAt: new Date(now).toISOString() };
  it('includes an OS notification and the account/chat tap target', () => {
    const payload = buildPushMessage(input, now)!;
    expect(payload.message.notification).toEqual({ title: input.title, body: 'Done All checks passed.' });
    expect(payload.message.data).toEqual({ message_id: 'reply', chat_id: 'chat', account_email: input.email });
    expect(payload.message.android.notification.tag).toBe('reply');
    expect(payload.message.android.priority).toBe('HIGH');
  });
  it('expires delayed replies instead of delivering stale alerts', () => {
    expect(buildPushMessage(input, now + 3_600_001)).toBeNull();
    expect(buildPushMessage({ ...input, createdAt: 'invalid' }, now)).toBeNull();
    expect(buildPushMessage(input, now + 3_000_000)?.message.android.ttl).toBe('600s');
  });
  it('keeps previews brief and does not confuse payload errors with revoked tokens', () => {
    expect(notificationPreview('x'.repeat(400))).toHaveLength(178);
    expect(isExpiredToken({ error: { details: [{ errorCode: 'UNREGISTERED' }] } })).toBe(true);
    expect(isExpiredToken({ error: { details: [{ errorCode: 'INVALID_ARGUMENT' }] } })).toBe(false);
    expect(isExpiredToken(null)).toBe(false);
  });
  it('backs off transient failures with a capped retry delay', () => {
    expect([1, 2, 3, 8].map(retryDelaySeconds)).toEqual([30, 60, 120, 900]);
  });
});
