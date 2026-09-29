import { useLayoutEffect, useRef, useState } from 'react';
import { SendIcon } from './icons';

interface Props {
  placeholder: string;
  onSend: (text: string) => Promise<void> | void;
  /** Desktop: Enter sends, Shift+Enter adds a line. Phone: Enter adds a line. */
  enterSends: boolean;
  disabled?: boolean;
}

export function Composer({ placeholder, onSend, enterSends, disabled }: Props) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [text]);

  const submit = async () => {
    const body = text.trim();
    if (!body || sending || disabled) return;
    setSending(true);
    try {
      await onSend(body);
      setText('');
    } finally {
      setSending(false);
      ref.current?.focus();
    }
  };

  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <textarea
        ref={ref}
        rows={1}
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (enterSends && e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
      />
      <button type="submit" className="send" disabled={!text.trim() || sending || disabled} aria-label="Send">
        <SendIcon width={19} height={19} strokeWidth={2.4} />
      </button>
    </form>
  );
}
