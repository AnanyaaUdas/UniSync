// the list of group chat messages and the box to send one.
// used in the chat drawer and inside the video call
import React, { useEffect, useRef, useState } from 'react';
import { Avatar, Empty, useNow } from '../common/ui';
import Icon from '../common/Icon';
import { useDB, update, userById, displayName } from '../../store/db';
import { timeAgo, uid, firstName } from '../../lib/format';

// card for the meeting minutes / log posted after a call
function NotesCard({ message, requestedBy }) {
  const [open, setOpen] = useState(false);
  const notes = message.notes;
  const type = notes.mode === 'log' ? 'log' : 'minutes';

  function download() {
    const file = new Blob([notes.markdown], { type: 'text/markdown' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(file);
    link.download = notes.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.md';
    link.click();
    URL.revokeObjectURL(link.href);
  }

  const smallButton = 'btn px-3 py-2 rounded-lg bg-white border line font-bold text-[12px] inline-flex items-center gap-1';

  return (
    <div className="fade rounded-2xl border overflow-hidden" style={{ borderColor: '#c7d2fe', background: 'var(--tint)' }}>
      <div className="p-3.5 grad text-white">
        <div className="flex items-center gap-2 text-[11px] font-bold opacity-90"><Icon name="notes" size={13} /> MEETING {type.toUpperCase()}</div>
        <div className="font-extrabold text-[14px] mt-1 leading-snug">{notes.title}</div>
        <div className="text-[11.5px] opacity-85 mt-0.5">Requested by {requestedBy}</div>
      </div>
      <div className="p-3.5 text-[12.5px]">
        <p className="leading-snug">{notes.preview}</p>
        {open && (
          <div className="prose-notes mt-2">
            {notes.sections.map((s) => (
              <div key={s.h}>
                <h3>{s.h}</h3>
                <ul>{s.items.map((item, i) => <li key={i}>{item}</li>)}</ul>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2 mt-3">
          <button onClick={() => setOpen(!open)} className={`${smallButton} flex-1 justify-center`}>{open ? 'Hide' : `View full ${type}`}</button>
          <button onClick={download} className={smallButton} title="Download"><Icon name="download" size={13} /> .md</button>
          <button onClick={() => navigator.clipboard?.writeText(notes.markdown)} className={smallButton} title="Copy"><Icon name="copy" size={13} /> Copy</button>
        </div>
      </div>
    </div>
  );
}

export default function ChatPanel({ me, projectId }) {
  const d = useDB();
  const now = useNow();
  const project = d.projects.find((p) => p.id === projectId);
  const listRef = useRef();
  const [text, setText] = useState('');
  const count = project?.chat.length || 0;

  // scroll to the newest message
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [count]);

  if (!project) return null;

  function send(e) {
    e.preventDefault();
    if (!text.trim()) return;
    update((db) => {
      db.projects.find((p) => p.id === projectId).chat.push({ id: uid('c'), who: me, txt: text.trim(), at: Date.now() });
    });
    setText('');
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {!project.chat.length && <Empty>No messages yet. Say hello to your team.</Empty>}

        {project.chat.map((msg) => {
          const user = userById(d, msg.who);

          if (msg.type === 'system') {
            return <div key={msg.id} className="text-center text-[11.5px] font-semibold muted">{msg.txt} · {timeAgo(msg.at, now)}</div>;
          }
          if (msg.type === 'meeting-notes') {
            return <NotesCard key={msg.id} message={msg} requestedBy={msg.who === me ? 'you' : displayName(user)} />;
          }

          const mine = msg.who === me;
          return (
            <div key={msg.id} className={`flex gap-2.5 fade ${mine ? 'flex-row-reverse' : ''}`}>
              <Avatar id={msg.who} size={30} />
              <div className="max-w-[78%]">
                <div className={`text-[11px] font-bold mb-1 muted ${mine ? 'text-right' : ''}`}>{firstName(displayName(user))} · {timeAgo(msg.at, now)}</div>
                <div className={`p-3 rounded-2xl text-[13px] leading-snug break-words ${mine ? 'grad text-white rounded-tr-md' : 'rounded-tl-md'}`}
                  style={mine ? {} : { background: 'var(--soft3)' }}>
                  {msg.txt}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <form onSubmit={send} className="p-3 border-t line flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Message the team…" className="field flex-1" autoComplete="off" />
        <button className="btn grad text-white font-bold px-4 rounded-xl text-[13px]">Send</button>
      </form>
    </div>
  );
}
