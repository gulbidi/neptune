import { useState } from 'react';
import type { Chat } from '../lib/types';
import { cleanTitle, TITLE_MAX } from './chatTitle';

/** Rename or delete one chat. Opened by a long press in the list or from a chat's menu. */
export function ChatSheet({
  chat,
  agentName,
  onRename,
  onDelete,
  onClose,
}: {
  chat: Chat;
  agentName: string;
  onRename: (title: string | null) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(chat.title ?? '');
  const [confirm, setConfirm] = useState(false);
  const title = cleanTitle(name);
  const changed = title !== chat.title;

  return (
    <>
      <div className="scrim dim" onClick={onClose} />
      <div className="sheet chat-sheet" role="dialog" aria-label="Chat options">
        <div className="sheet-title">{agentName} chat</div>
        <form
          className="rename"
          onSubmit={(e) => {
            e.preventDefault();
            if (changed) onRename(title);
            else onClose();
          }}
        >
          <input
            className="plain-input"
            value={name}
            maxLength={TITLE_MAX}
            placeholder="New chat"
            aria-label="Chat name"
            autoFocus
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit" className="mini" disabled={!changed}>Save</button>
        </form>
        <button
          className={`delete ${confirm ? 'armed' : ''}`}
          onClick={() => (confirm ? onDelete() : setConfirm(true))}
        >
          {confirm ? 'Tap again to delete' : 'Delete chat'}
        </button>
      </div>
    </>
  );
}
