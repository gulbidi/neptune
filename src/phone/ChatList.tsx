import { useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { agentLabel, isOnline, useNow } from '../lib/useConversation';
import type { Agent, Chat, Node } from '../lib/types';
import { MoreIcon, PlusIcon } from '../ui/icons';
import { Reticle } from '../ui/Reticle';
import { APP_VERSION } from '../lib/version';
import { ago } from '../ui/time';
import { ChatSheet } from './ChatSheet';

const monogram = (name: string) => name.slice(0, 2).toUpperCase();
const HOLD_MS = 500;

/** Press-and-hold on touch, right-click on desktop. The tap that ends a hold doesn't also open the chat. */
function useLongPress(onHold: (chat: Chat) => void) {
  const timer = useRef<number>(undefined);
  const held = useRef(false);
  const cancel = () => window.clearTimeout(timer.current);
  return (chat: Chat) => ({
    onPointerDown: () => {
      held.current = false;
      cancel();
      timer.current = window.setTimeout(() => {
        held.current = true;
        onHold(chat);
      }, HOLD_MS);
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onContextMenu: (e: MouseEvent) => {
      e.preventDefault();
      cancel();
      if (!held.current) onHold(chat);
      held.current = true;
    },
    held: () => {
      const was = held.current;
      held.current = false;
      return was;
    },
  });
}

export function ChatList({
  email,
  others,
  chats,
  agents,
  nodes,
  live,
  loaded,
  onOpen,
  onUsage,
  onPair,
  onCreate,
  onRename,
  onDelete,
  onRemoveNode,
  onSwitch,
  onAddAccount,
  onCheckUpdates,
  onSignOut,
  banner,
}: {
  email: string;
  /** Other accounts signed in on this phone. */
  others: string[];
  chats: Chat[];
  agents: Agent[];
  nodes: Node[];
  live: boolean;
  loaded: boolean;
  onOpen: (chat: Chat) => void;
  onUsage: () => void;
  onPair: () => void;
  onCreate: (agentId: string) => void;
  onRename: (chat: Chat, title: string | null) => void;
  onDelete: (chat: Chat) => void;
  onRemoveNode: (nodeId: string) => void;
  onSwitch: (email: string) => void;
  onAddAccount: () => void;
  onCheckUpdates: () => void;
  onSignOut: () => void;
  banner?: ReactNode;
}) {
  const now = useNow(5000);
  const [filter, setFilter] = useState<string>('all');
  const [menu, setMenu] = useState(false);
  const [picker, setPicker] = useState(false);
  const [pcs, setPcs] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [editing, setEditing] = useState<Chat | null>(null);
  const press = useLongPress(setEditing);
  const label = (a: Agent | undefined) => agentLabel(a, nodes);
  const account = email.split('@')[0].toUpperCase();

  const byId = useMemo(() => Object.fromEntries(agents.map((a) => [a.id, a])), [agents]);
  const shown = filter === 'all' ? chats : chats.filter((c) => c.agent_id === filter);
  const onlineCount = agents.filter((a) => isOnline(a, now)).length;
  const busy = agents.some((a) => isOnline(a, now) && a.current_chat_id);

  const create = (agentId: string) => {
    setPicker(false);
    onCreate(agentId);
  };

  return (
    <div className="phone">
      <header className="chat-head">
        <div className="avatar">
          <Reticle size={46} detail="mini" state={busy ? 'busy' : onlineCount ? 'idle' : 'offline'} />
        </div>
        <div className="who">
          <div className="name">
            NEPTUNE<small>// {others.length || nodes.length !== 1 ? account : nodes[0].name.toUpperCase()}</small>
          </div>
          <div className={`sub ${onlineCount ? 'on' : ''}`}>
            <span className={`led ${busy ? 'busy' : onlineCount ? 'on' : ''}`} />
            {onlineCount}/{agents.length} agents online
            {agents.some((a) => a.paused && isOnline(a, now)) && <span className="reconnecting"> · {agents.filter((a) => a.paused && isOnline(a, now)).length} paused</span>}
            {!live && <span className="reconnecting"> · reconnecting</span>}
          </div>
        </div>
        <button className="icon-btn" onClick={() => setMenu((v) => !v)} aria-label="Menu">
          <MoreIcon />
        </button>
        {menu && (
          <>
            <div className="scrim" onClick={() => setMenu(false)} />
            <div className="menu">
              <div className="menu-meta">
                Signed in as
                <b>{email}</b>
              </div>
              {others.map((o) => (
                <button key={o} onClick={() => { setMenu(false); onSwitch(o); }}>Switch to {o.split('@')[0]}</button>
              ))}
              <button onClick={() => { setMenu(false); onAddAccount(); }}>Add account</button>
              <button onClick={() => { setMenu(false); setPcs(true); setConfirm(null); }}>PCs ({nodes.length})</button>
              <button onClick={() => { setMenu(false); onPair(); }}>Pair a PC</button>
              <button onClick={() => { setMenu(false); onUsage(); }}>Usage</button>
              <button onClick={() => { setMenu(false); onCheckUpdates(); }}>Check for updates</button>
              <button className="danger" onClick={() => { setMenu(false); onSignOut(); }}>Sign out</button>
              <div className="menu-meta">Neptune v{APP_VERSION}</div>
            </div>
          </>
        )}
      </header>

      <div className="filters">
        <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>
          All <i>{chats.length}</i>
        </button>
        {agents.map((a) => (
          <button key={a.id} className={filter === a.id ? 'on' : ''} onClick={() => setFilter(a.id)}>
            <span className={`led ${isOnline(a, now) ? (a.paused ? 'paused' : 'on') : ''}`} />
            {label(a)} <i>{chats.filter((c) => c.agent_id === a.id).length}</i>
          </button>
        ))}
      </div>

      {banner}

      <div className="chat-list">
        {loaded && shown.length === 0 && (
          <div className="empty">
            <Reticle size={170} detail="lite" state={onlineCount ? 'idle' : 'offline'} />
            <h2 className="caret">NO CHANNELS</h2>
            <p>Start a chat with {filter === 'all' ? 'an agent' : label(byId[filter])}. Each chat keeps its own conversation.</p>
          </div>
        )}
        {shown.map((c) => {
          const agent = byId[c.agent_id];
          const working = !!agent && agent.current_chat_id === c.id && isOnline(agent, now);
          const name = label(agent);
          const { held, ...hold } = press(c);
          return (
            <button key={c.id} className={`chat-row ${working ? 'working' : ''}`} {...hold} onClick={() => !held() && onOpen(c)}>
              <span className={`agent-badge a-${agent?.kind}`}>
                {monogram(agent?.name ?? '?')}
                <i className={`led ${working ? 'busy' : isOnline(agent, now) ? (agent.paused ? 'paused' : 'on') : ''}`} />
              </span>
              <span className="chat-main">
                <span className="chat-top">
                  <b>{c.title || 'New chat'}</b>
                  <time>{ago(c.updated_at, now)}</time>
                </span>
                <span className="chat-sub">
                  <em>{name}</em>
                  {working ? (
                    <span className="g">{agent.activity || 'Working…'}</span>
                  ) : (
                    <span>{c.preview ? `${c.last_sender === 'user' ? 'You: ' : ''}${c.preview}` : 'No messages yet'}</span>
                  )}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <button className="fab" onClick={() => (filter !== 'all' ? create(filter) : setPicker(true))}>
        <PlusIcon width={18} height={18} /> New {filter !== 'all' ? (byId[filter]?.name ?? '') : ''} chat
      </button>

      {picker && (
        <>
          <div className="scrim dim" onClick={() => setPicker(false)} />
          <div className="sheet">
            <div className="sheet-title">Choose an agent</div>
            {agents.map((a) => {
              const on = isOnline(a, now);
              return (
                <button key={a.id} onClick={() => create(a.id)}>
                  <span className={`agent-badge a-${a.kind}`}>{monogram(a.name)}</span>
                  <span className="chat-main">
                    <b>{label(a)}</b>
                    <span className={on ? 'g' : ''}>
                      {on ? `${a.paused ? 'Paused (messages will queue)' : 'Online'} · ${a.machine ?? 'PC'}` : a.last_seen ? `Offline · seen ${ago(a.last_seen, now)}` : 'Not set up on the PC yet'}
                    </span>
                  </span>
                </button>
              );
            })}
            {!agents.length && <p className="sheet-empty">No agents yet. Pair a PC from the menu, then open Neptune on it.</p>}
          </div>
        </>
      )}

      {editing && (
        <ChatSheet
          chat={editing}
          agentName={label(byId[editing.agent_id])}
          onClose={() => setEditing(null)}
          onRename={(title) => {
            setEditing(null);
            onRename(editing, title);
          }}
          onDelete={() => {
            setEditing(null);
            onDelete(editing);
          }}
        />
      )}

      {pcs && (
        <>
          <div className="scrim dim" onClick={() => setPcs(false)} />
          <div className="sheet">
            <div className="sheet-title">PCs on {email}</div>
            {nodes.map((n) => {
              const mine = agents.filter((a) => a.node_id === n.id);
              const on = mine.some((a) => isOnline(a, now));
              const seen = mine.map((a) => a.last_seen).filter(Boolean).sort().pop() ?? null;
              return (
                <div key={n.id} className="pc-row">
                  <span className={`led ${on ? 'on' : ''}`} />
                  <span className="chat-main">
                    <b>{n.name}</b>
                    <span className={on ? 'g' : ''}>
                      {n.machine ?? 'PC'} · {on ? 'online' : seen ? `seen ${ago(seen, now)}` : 'waiting for the PC'} · agent {n.agent_email}
                    </span>
                  </span>
                  <button
                    className={`mini ${confirm === n.id ? 'danger' : ''}`}
                    onClick={() => {
                      if (confirm !== n.id) return setConfirm(n.id);
                      setConfirm(null);
                      onRemoveNode(n.id);
                    }}
                  >
                    {confirm === n.id ? 'Remove + chats?' : 'Remove'}
                  </button>
                </div>
              );
            })}
            <button onClick={() => { setPcs(false); onPair(); }}>
              <span className="agent-badge">+</span>
              <span className="chat-main">
                <b>Pair a PC</b>
                <span>Scan the code a new PC shows</span>
              </span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
