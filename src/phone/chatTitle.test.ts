import { describe, expect, it } from 'vitest';
import { cleanTitle, TITLE_MAX } from './chatTitle';

describe('cleanTitle', () => {
  it('collapses whitespace and trims', () => {
    expect(cleanTitle('  Fix   the\nbuild  ')).toBe('Fix the build');
  });

  it('clears the title when nothing is left', () => {
    expect(cleanTitle('')).toBeNull();
    expect(cleanTitle(' \n\t ')).toBeNull();
  });

  it('caps the length at the database limit', () => {
    expect(cleanTitle('x'.repeat(TITLE_MAX + 50))).toHaveLength(TITLE_MAX);
    expect(cleanTitle(`${'x'.repeat(TITLE_MAX - 1)} y`)).toBe('x'.repeat(TITLE_MAX - 1));
  });
});
