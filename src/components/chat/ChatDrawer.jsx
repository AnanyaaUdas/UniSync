// slide-in panel on the right with the group chat and the video call button
import React, { useEffect } from 'react';
import ChatPanel from './ChatPanel';
import { Avatar } from '../common/ui';
import { useDB } from '../../store/db';
import { liveCall } from '../call/callActions';
import Icon from '../common/Icon';

export default function ChatDrawer({ me, projectId, onClose, onCall }) {
  const p = useDB((d) => d.projects.find((x) => x.id === projectId));
  const call = useDB((d) => liveCall(d.calls[projectId]));
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  if (!p) return null;
  const inCall = call ? Object.keys(call.participants).length : 0;
  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/40" onClick={onClose} />
      <aside className="slidein fixed top-0 right-0 z-50 h-full w-full sm:w-[420px] bg-white border-l line flex flex-col">
        <div className="p-5 border-b line flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-extrabold tracking-tight">Group Chat</h2>
            <p className="text-[12px] mt-0.5 muted truncate">{p.name} · general project channel</p>
            <div className="flex -space-x-2 mt-2">{p.members.map((m) => <Avatar key={m} id={m} size={26} showOnline />)}</div>
          </div>
          <button onClick={onCall} className={`btn flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12.5px] font-bold text-white ${call ? 'bg-emerald-600 ring-pulse' : 'grad'}`} title="Video call with screen sharing and meeting notes">
            <Icon name="video" size={16} /> {call ? `Join call (${inCall})` : 'Video call'}
          </button>
          <button onClick={onClose} aria-label="Close" className="btn p-1 text-slate-400 hover:text-slate-700"><Icon name="x" size={20} /></button>
        </div>
        <ChatPanel me={me} projectId={projectId} />
      </aside>
    </>
  );
}
