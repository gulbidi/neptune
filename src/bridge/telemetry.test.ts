import { describe, expect, it } from 'vitest';
import { fmtBytes, fmtUptime } from './telemetry';

describe('fmtBytes', () => {
  it('picks a unit and precision', () => {
    expect(fmtBytes(512)).toBe('512 B');
    expect(fmtBytes(1536)).toBe('1.5 KB');
    expect(fmtBytes(200 * 1024 * 1024, true)).toBe('200 MB/s');
  });
});

describe('fmtUptime', () => {
  it('shows days only when there are some', () => {
    expect(fmtUptime(3_661)).toBe('01:01:01');
    expect(fmtUptime(90_061)).toBe('1d 01:01:01');
  });
});
