import { describe, expect, it } from 'vitest';
import { agentLabel, isOnline } from './useConversation';
import type { Agent, Node } from './types';

const agent = (over: Partial<Agent> = {}): Agent => ({
  id: 'a1', node_id: 'n1', kind: 'claude', name: 'Claude', online: true, activity: null, current_chat_id: null,
  machine: null, version: null, last_seen: new Date(0).toISOString(), paused: false, usage: null, updated_at: '', ...over,
});
const node = (id: string, name: string): Node => ({ id, name, operator_email: '', agent_email: '', machine: null, created_at: '' });

describe('isOnline', () => {
  it('needs a recent heartbeat and the online flag', () => {
    expect(isOnline(agent(), 10_000)).toBe(true);
    expect(isOnline(agent(), 80_000)).toBe(false);
    expect(isOnline(agent({ online: false }), 10_000)).toBe(false);
    expect(isOnline(agent({ last_seen: null }), 10_000)).toBe(false);
    expect(isOnline(null, 10_000)).toBe(false);
  });
});

describe('agentLabel', () => {
  it('adds the PC name only when there are several PCs', () => {
    expect(agentLabel(agent(), [node('n1', 'Home')])).toBe('Claude');
    expect(agentLabel(agent(), [node('n1', 'Home'), node('n2', 'Work')])).toBe('Claude · Home');
    expect(agentLabel(undefined, [])).toBe('Agent');
  });
});
