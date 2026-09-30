import { describe, expect, it } from 'vitest';
import { ago, duration } from './time';

describe('ago', () => {
  const now = Date.parse('2026-01-01T12:00:00Z');
  const before = (ms: number) => new Date(now - ms).toISOString();

  it('rounds to the largest sensible unit', () => {
    expect(ago(null, now)).toBe('never');
    expect(ago(before(30_000), now)).toBe('just now');
    expect(ago(before(5 * 60_000), now)).toBe('5m ago');
    expect(ago(before(3 * 3_600_000), now)).toBe('3h ago');
    expect(ago(before(2 * 86_400_000), now)).toBe('2d ago');
  });

  it('never goes negative for clock skew', () => {
    expect(ago(new Date(now + 60_000).toISOString(), now)).toBe('just now');
  });
});

describe('duration', () => {
  it('formats seconds and minutes', () => {
    expect(duration()).toBe('');
    expect(duration(42_000)).toBe('42s');
    expect(duration(125_000)).toBe('2m 5s');
  });
});
