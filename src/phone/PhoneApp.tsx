import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ClientContext, useClient } from './client';
import { activeAccount, adoptLegacySession, clientFor, forgetAccount, listAccounts, saveAccounts, setActiveAccount } from './accounts';
import { AuthScreen } from './AuthScreen';
import { ChatList } from './ChatList';
import { ChatScreen } from './ChatScreen';
import { PairScreen } from './PairScreen';
import { UsageScreen } from './UsageScreen';
import { ScanOverlay } from './scan';
import { ensureNotifyPermission, notify } from '../lib/notify';
import { agentLabel, useChats } from '../lib/useConversation';
import { checkPhoneUpdate, type PhoneUpdate } from '../lib/updates';
import { openExternal } from '../lib/open';
import type { Chat, Message } from '../lib/types';
import { allowPushRegistration, setPushContext, unregisterPush, usePush, usesNativePush, type PushTarget } from './push';

export function PhoneApp() {
  const [accounts, setAccounts] = useState<string[]>(() => {
    adoptLegacySession();
    return listAccounts();
  });
  const [active, setActive] = useState<string | null>(() => {
    const a = activeAccount();
    return a && listAccounts().includes(a) ? a : (listAccounts()[0] ?? null);
  });
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [pushTarget, setPushTarget] = useState<PushTarget | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

  const use = useCallback((email: string) => {
    allowPushRegistration(email);
    saveAccounts([...listAccounts(), email]);
    setActiveAccount(email);
    setAccounts(listAccounts());
    setActive(email);
    setAdding(false);
  }, []);

  const forget = useCallback(async (email: string) => {
    // signOut emits SIGNED_OUT after forgetAccount has already removed this account.
    if (!listAccounts().includes(email)) return;
    try {
      await unregisterPush(email);
      await forgetAccount(email);
      setAccounts(listAccounts());
      setActive(activeAccount());
      setPushContext(null, null);
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Could not sign out.');
    }
  }, []);

  const openPush = useCallback((target: PushTarget) => {
    setActiveAccount(target.email);
    setActive(target.email);
    setAdding(false);
    setPushTarget(target);
  }, []);
  const pushHandled = useCallback(() => setPushTarget(null), []);
  usePush(accounts, openPush, setToast);

  const others = accounts.filter((a) => a !== active);

  return (
    <>
      {!active || adding ? (
        <AuthScreen onSignedIn={use} onCancel={active ? () => setAdding(false) : undefined} />
      ) : (
        <ClientContext.Provider value={clientFor(active)}>
          <Account
            key={active}
            email={active}
            others={others}
            onSwitch={use}
            onAddAccount={() => setAdding(true)}
            onAccountAdded={use}
            onSignOut={() => forget(active)}
            onToast={setToast}
            pushTarget={pushTarget?.email === active ? pushTarget : null}
            onPushHandled={pushHandled}
          />
        </ClientContext.Provider>
      )}
      {others.map((email) => (
        <BackgroundAccount key={email} email={email} />
      ))}
      <ScanOverlay />
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

type AccountProps = {
  email: string;
  others: string[];
  onSwitch: (email: string) => void;
  onAddAccount: () => void;
  onAccountAdded: (email: string) => void;
  onSignOut: () => void;
  onToast: (text: string) => void;
  pushTarget: PushTarget | null;
  onPushHandled: () => void;
};

/** Waits for the account's stored session; a lost session signs the account out. */
function Account(props: AccountProps) {
  const client = useClient();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const { onSignOut } = props;

  useEffect(() => {
    client.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = client.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'SIGNED_OUT') onSignOut();
    });
    return () => data.subscription.unsubscribe();
  }, [client, onSignOut]);

  useEffect(() => {
    if (session === null) onSignOut();
  }, [session, onSignOut]);

  if (!session) return <div className="splash" />;
  return <Home {...props} session={session} />;
}

/** Other signed-in accounts still notify when their agents reply. */
function BackgroundAccount({ email }: { email: string }) {
  useEffect(() => {
    if (usesNativePush()) return;
    const client = clientFor(email);
    const since = Date.now();
    const channel = client
      .channel('neptune-background')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (p) => {
        const m = p.new as Message;
        if (m.sender === 'user' || Date.parse(m.created_at) < since) return;
        notify(`Neptune · ${email.split('@')[0]}`, m.body);
      })
      .subscribe();
    return () => {
      client.removeChannel(channel);
    };
  }, [email]);
  return null;
}

type NavState = { chat?: string; usage?: boolean; pair?: boolean } | null;
type View = 'list' | 'usage' | 'pair';

/** Chat list ⇄ chat / usage / pairing. Opening one pushes a history entry so Android's back button returns to the list. */
function Home({ session, email, others, onSwitch, onAddAccount, onAccountAdded, onSignOut, onToast, pushTarget, onPushHandled }: AccountProps & { session: Session }) {
  const client = useClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [view, setView] = useState<View>('list');
  const [update, setUpdate] = useState<PhoneUpdate | null>(null);
  const startedAt = useRef(Date.now());
  const openRef = useRef(openId);
  openRef.current = openId;

  const { chats, agents, nodes, loaded, live, putChat, dropChat, refresh } = useChats(client, (m: Message) => {
    if (usesNativePush()) return;
    if (m.sender === 'user') return;
    if (Date.parse(m.created_at) < startedAt.current) return;
    if (document.visibilityState === 'visible' && openRef.current === m.chat_id) return;
    const chat = chats.find((c) => c.id === m.chat_id);
    const agent = agents.find((a) => a.id === chat?.agent_id);
    notify(m.sender === 'agent' ? agentLabel(agent, nodes) : 'Neptune', m.body);
  });

  useEffect(() => {
    setPushContext(email, view === 'list' ? openId : null);
    return () => setPushContext(null, null);
  }, [email, openId, view]);

  useEffect(() => {
    if (!pushTarget) return;
    let disposed = false;
    client.from('chats').select('*').eq('id', pushTarget.chatId).maybeSingle().then(({ data, error }) => {
      if (disposed) return;
      onPushHandled();
      if (error || !data) return onToast('This chat is no longer available.');
      putChat(data as Chat);
      history.pushState({ chat: data.id }, '');
      setView('list');
      setOpenId(data.id);
    });
    return () => { disposed = true; };
  }, [client, pushTarget, putChat, onToast, onPushHandled]);

  useEffect(() => {
    ensureNotifyPermission();
    checkPhoneUpdate().then(setUpdate).catch(() => {});
    const onPop = () => {
      const st = history.state as NavState;
      setOpenId(st?.chat ?? null);
      setView(st?.usage ? 'usage' : st?.pair ? 'pair' : 'list');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const open = useCallback((chat: Chat) => {
    history.pushState({ chat: chat.id }, '');
    setOpenId(chat.id);
  }, []);
  const show = useCallback((v: 'usage' | 'pair') => {
    history.pushState({ [v]: true }, '');
    setView(v);
  }, []);
  const back = useCallback(() => {
    const st = history.state as NavState;
    if (st?.chat || st?.usage || st?.pair) history.back();
    else {
      setOpenId(null);
      setView('list');
    }
  }, []);

  const create = async (agentId: string) => {
    const { data, error } = await client.from('chats').insert({ agent_id: agentId }).select().single();
    if (error) return onToast(error.message);
    putChat(data as Chat);
    open(data as Chat);
  };

  const rename = async (chat: Chat, title: string | null) => {
    const { data, error } = await client.from('chats').update({ title }).eq('id', chat.id).select().single();
    if (error) return onToast(error.message);
    putChat(data as Chat);
  };

  const removeChat = async (chat: Chat) => {
    const { error } = await client.from('chats').delete().eq('id', chat.id);
    if (error) return onToast(error.message);
    dropChat(chat.id);
    onToast('Chat deleted');
  };

  const removeNode = async (id: string) => {
    const { error } = await client.from('nodes').delete().eq('id', id);
    if (error) return onToast(error.message);
    refresh();
  };

  const chat = chats.find((c) => c.id === openId);

  if (view === 'pair')
    return (
      <PairScreen
        session={session}
        onBack={back}
        onPaired={(name, account) => {
          back();
          refresh();
          onToast(`${name} paired. It signs in within a few seconds.`);
          if (account) onAccountAdded(account);
        }}
      />
    );
  if (view === 'usage') return <UsageScreen agents={agents} nodes={nodes} chats={chats} onBack={back} />;
  if (chat)
    return (
      <ChatScreen
        key={chat.id}
        chat={chat}
        agent={agents.find((a) => a.id === chat.agent_id)}
        nodes={nodes}
        onBack={back}
        onDeleted={() => { dropChat(chat.id); back(); }}
        onRename={(title) => rename(chat, title)}
        onError={onToast}
      />
    );
  return (
    <ChatList
      email={email}
      others={others}
      chats={chats}
      agents={agents}
      nodes={nodes}
      live={live}
      loaded={loaded}
      onOpen={open}
      onUsage={() => show('usage')}
      onPair={() => show('pair')}
      onCreate={create}
      onRename={rename}
      onDelete={removeChat}
      onRemoveNode={removeNode}
      onSwitch={onSwitch}
      onAddAccount={onAddAccount}
      onCheckUpdates={async () => {
        const u = await checkPhoneUpdate().catch(() => null);
        setUpdate(u);
        if (!u) onToast("You're on the latest version");
      }}
      onSignOut={onSignOut}
      banner={
        update && (
          <button className="update-banner" onClick={() => openExternal(update.url)}>
            <span>Neptune {update.version} is available</span>
            <b>Download</b>
          </button>
        )
      }
    />
  );
}
