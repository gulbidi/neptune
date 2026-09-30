import { describe, expect, it } from 'vitest';
import { compareVersions } from './updates';

describe('compareVersions', () => {
  it('orders by major, minor, then patch', () => {
    expect(compareVersions('0.2.0', '0.1.9')).toBe(1);
    expect(compareVersions('1.0.0', '0.9.9')).toBe(1);
    expect(compareVersions('0.1.1', '0.1.10')).toBe(-1);
  });

  it('treats missing parts as zero', () => {
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.1', '1.0')).toBe(1);
  });
});
