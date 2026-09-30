import { describe, expect, it } from 'vitest';
import { loginQr, pairQr, parseQr } from './config';

describe('parseQr', () => {
  it('round-trips a login code', () => {
    expect(parseQr(loginQr('me@example.com', '123456'))).toEqual({ kind: 'login', email: 'me@example.com', code: '123456' });
  });

  it('lowercases the email and trims whitespace', () => {
    expect(parseQr('  neptune:login:Me@Example.com:12345678 ')).toEqual({ kind: 'login', email: 'me@example.com', code: '12345678' });
  });

  it('round-trips a pairing code and uppercases it', () => {
    expect(parseQr(pairQr('abcd1234'))).toEqual({ kind: 'pair', code: 'ABCD1234' });
  });

  it('rejects anything else', () => {
    expect(parseQr('neptune:login:me@example.com:123')).toBeNull();
    expect(parseQr('neptune:pair:ABC')).toBeNull();
    expect(parseQr('https://example.com')).toBeNull();
  });
});
