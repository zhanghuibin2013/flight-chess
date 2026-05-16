import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';

export default function LogPanel() {
  const log = useStore(s => s.log);
  const chat = useStore(s => s.chat);
  const chatSay = useStore(s => s.chatSay);
  const [msg, setMsg] = useState('');
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [log.length, chat.length]);

  return (
    <div className="log-panel">
      <h3>Log</h3>
      <div className="log-body" ref={ref}>
        {log.slice(-100).map((l, i) => <div key={`l${i}`} className="log-line">{l}</div>)}
        {chat.slice(-50).map((c, i) => (
          <div key={`c${i}`} className="chat-line"><strong>{c.nickname}:</strong> {c.message}</div>
        ))}
      </div>
      <form className="chat-input" onSubmit={e => { e.preventDefault(); if (msg.trim()) { chatSay(msg.trim()); setMsg(''); } }}>
        <input value={msg} onChange={e => setMsg(e.target.value)} placeholder="Say something…" maxLength={200} />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
