import { describe, expect, it } from 'vitest';
import { claudeUsage, codexUsage, describeTool } from './agents';

describe('describeTool', () => {
  it('describes common tools in plain words', () => {
    expect(describeTool('Bash', { description: 'Install deps' })).toBe('Running Install deps');
    expect(describeTool('Read', { file_path: String.raw`C:\repo\src\main.tsx` })).toBe('Reading main.tsx');
    expect(describeTool('Edit', { file_path: '/repo/a/b.ts' })).toBe('Editing b.ts');
    expect(describeTool('TodoWrite')).toBe('Planning next steps');
  });

  it('strips the MCP prefix from unknown tools', () => {
    expect(describeTool('mcp__gmail__send_message')).toBe('Using send_message');
  });

  it('clips long commands', () => {
    expect(describeTool('Bash', { command: 'x'.repeat(200) })).toHaveLength('Running '.length + 80);
  });
});

describe('claudeUsage', () => {
  it('reads every unified window', () => {
    const u = claudeUsage({ unifiedWindows: { five_hour: { utilization: 0.42, resetsAt: 1_800_000_000 }, seven_day: { utilization: 0.1 } }, status: 'allowed' });
    expect(u?.windows).toEqual([
      { id: 'five_hour', label: '5-hour', pct: 42, resets_at: new Date(1_800_000_000_000).toISOString() },
      { id: 'seven_day', label: 'Weekly', pct: 10, resets_at: null },
    ]);
    expect(u?.status).toBe('allowed');
  });

  it('falls back to the single binding window', () => {
    expect(claudeUsage({ utilization: 0.5, rateLimitType: 'five_hour' })?.windows[0]).toMatchObject({ label: '5-hour', pct: 50 });
  });

  it('returns null when there is nothing to show', () => {
    expect(claudeUsage(null)).toBeNull();
    expect(claudeUsage({})).toBeNull();
  });
});

describe('codexUsage', () => {
  it('labels windows by length', () => {
    const u = codexUsage({ primary: { used_percent: 12.34, window_minutes: 300 }, secondary: { used_percent: 150, window_minutes: 10080 } });
    expect(u?.windows.map((w) => [w.label, w.pct])).toEqual([['5-hour', 12.3], ['Weekly', 100]]);
  });

  it('returns null without limits', () => {
    expect(codexUsage(undefined)).toBeNull();
    expect(codexUsage({ primary: {} })).toBeNull();
  });
});
