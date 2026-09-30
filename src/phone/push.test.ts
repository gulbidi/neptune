import { describe, expect, it } from 'vitest';
import { parsePushTarget } from './push';

describe('notification navigation', () => {
  const chatId = '11111111-2222-3333-4444-555555555555';
  it('opens only a signed-in account with a valid chat identifier', () => {
    expect(parsePushTarget({ email: 'home@example.com', chatId }, ['home@example.com'])).toEqual({ email: 'home@example.com', chatId });
    expect(parsePushTarget({ email: 'other@example.com', chatId }, ['home@example.com'])).toBeNull();
  });
  it('rejects malformed payloads and identifiers', () => {
    for (const value of [null, 'chat', {}, { email: 'home@example.com', chatId: '../secrets' }]) {
      expect(parsePushTarget(value, ['home@example.com'])).toBeNull();
    }
  });
});
