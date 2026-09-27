// the full screen video call: video tiles, buttons at the bottom,
// and a side panel with the group chat and the live transcript
import React, { useEffect, useRef, useState } from 'react';
import useCall from './useCall';
import useTranscriber from './useTranscriber';
import { startNotes, addTranscript, addManualNote, finishNotesNow } from './callActions';
import { Avatar, toast } from '../common/ui';
import ChatPanel from '../chat/ChatPanel';
import Icon from '../common/Icon';
import { useDB, userById, displayName } from '../../store/db';
import { duration, clock, firstName } from '../../lib/format';

const notesName = (mode) => (mode === 'log' ? 'log' : 'minutes');

function Video({ stream, muted, mirror, fit }) {
  const ref = useRef();
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream || null;
  }, [stream]);
  return (
    <video ref={ref} autoPlay playsInline muted={muted}
      className={`w-full h-full ${fit ? 'object-contain' : 'object-cover'} ${mirror ? '-scale-x-100' : ''}`} />
  );
}

// one person's box in the call
function Tile({ userId, stream, isMe, cam, mic, sharing, big, connecting }) {
  const user = useDB((d) => userById(d, userId));
  const showVideo = stream && (cam || sharing);
  return (
    <div className={`relative rounded-2xl overflow-hidden bg-slate-800 ring-1 ring-white/10 ${big ? 'h-full' : 'aspect-video'}`}>
      {/* the video stays on the page even when hidden so we can still hear them */}
      {stream && (
        <div className={showVideo ? 'absolute inset-0' : 'hidden'}>
          <Video stream={stream} muted={isMe} mirror={isMe && !sharing} fit={sharing} />
        </div>
      )}
      {!showVideo && (
        <div className="absolute inset-0 grid place-items-center">
          <div className="flex flex-col items-center gap-2">
            <Avatar id={userId} size={big ? 96 : 64} ring={false} />
            {connecting && <span className="text-white/60 text-[12px]">Connecting…</span>}
          </div>
        </div>
      )}
      <div className="absolute left-2 bottom-2 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-black/55 text-white text-[12px] font-semibold">
        {mic === false && <Icon name="micOff" size={13} title="Muted" />}
        {isMe ? 'You' : displayName(user)}{sharing && ' · presenting'}
      </div>
      {sharing && (
        <span className="absolute top-2 left-2 badge" style={{ background: '#4f46e5', color: '#fff' }}>
          <Icon name="screen" size={12} /> Screen
        </span>
      )}
    </div>
  );
}

// round button in the bottom bar
function CallButton({ on = true, onClick, label, children, danger, disabled, title }) {
  let look = 'bg-white text-slate-900';
  if (danger) look = 'bg-rose-600 text-white';
  else if (on) look = 'text-white hover:bg-white/20';
  return (
    <button onClick={onClick} disabled={disabled} title={title || label}
      className="btn flex flex-col items-center gap-1 min-w-[46px] sm:min-w-[58px] disabled:opacity-40">
      <span className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full grid place-items-center ${look}`}
        style={!danger && on ? { background: 'rgba(255,255,255,.12)' } : {}}>
        {children}
      </span>
      <span className="text-[10px] sm:text-[11px] text-white/80 font-semibold whitespace-nowrap max-w-[64px] sm:max-w-none truncate">{label}</span>
    </button>
  );
}

export default function CallRoom({ projectId, me, onLeave }) {
  const d = useDB();
  const project = d.projects.find((p) => p.id === projectId);
  const call = d.calls[projectId];
  const meUser = userById(d, me);
  const rtc = useCall({ projectId, me, meName: displayName(meUser), meColor: meUser.color });

  const [panel, setPanel] = useState(null); // 'chat', 'notes' or null
  const [notesMenu, setNotesMenu] = useState(false);
  const [mode, setMode] = useState('minutes');
  const [noteText, setNoteText] = useState('');

  // re-render every second for the call timer
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const notes = call?.notes;
  const notesOn = !!notes && !notes.done;
  const myNotes = notes?.byPeer === rtc.peerId; // did i turn on the notes
  const notesOwner = notes ? firstName(displayName(userById(d, notes.by))) : '';
  const transcript = call?.transcript || [];
  const typedNotes = call?.manual || [];

  // while notes are on, my mic is turned into text (unless i'm muted)
  const speech = useTranscriber({
    active: notesOn && rtc.media.mic && rtc.status === 'live',
    onFinal: (text) => addTranscript(projectId, me, text),
  });

  async function leave() {
    const lastOne = notesOn && Object.keys(call.participants).length <= 1;
    onLeave();
    if (lastOne) toast({ icon: 'notes', title: `Making the meeting ${notesName(notes.mode)}`, text: 'It will be posted in the group chat in a moment.' });
    await rtc.hangUp();
  }

  function turnOnNotes() {
    const result = startNotes(projectId, me, rtc.peerId, mode);
    setNotesMenu(false);
    if (!result.ok) {
      toast({ icon: 'lock', title: 'Already being recorded', text: `**${displayName(userById(d, result.holder))}** has already turned on notes for this call. Only one person can.` });
      return;
    }
    setPanel('notes');
    toast({ icon: 'notes', title: 'Notes are on', text: `Meeting ${notesName(mode)} will be posted to the chat when the call ends.` });
  }

  function addNote(e) {
    e.preventDefault();
    if (!noteText.trim()) return;
    addManualNote(projectId, me, noteText.trim());
    setNoteText('');
  }

  // my tile first, then everyone else
  const tiles = [
    { id: 'me', userId: me, stream: rtc.localStream, isMe: true, cam: rtc.media.cam, mic: rtc.media.mic, sharing: rtc.media.sharing },
    ...Object.entries(rtc.remotes)
      .filter(([, r]) => r.userId)
      .map(([id, r]) => ({ id, userId: r.userId, stream: r.stream, cam: r.cam !== false, mic: r.mic, sharing: r.sharing, connecting: !r.stream })),
  ];
  const presenter = tiles.find((t) => t.sharing);
  const others = presenter ? tiles.filter((t) => t !== presenter) : tiles;
  let gridCols = 'grid-cols-2 lg:grid-cols-3';
  if (others.length <= 1) gridCols = 'grid-cols-1';
  else if (others.length <= 4) gridCols = 'grid-cols-1 sm:grid-cols-2';
  const notInCall = project ? project.members.filter((m) => !tiles.some((t) => t.userId === m)) : [];

  // spoken lines and typed notes together, in time order
  const allLines = [...transcript, ...typedNotes.map((n) => ({ ...n, typed: true }))].sort((a, b) => a.at - b.at);
  const lastLine = transcript[transcript.length - 1];

  let notesBadge = '';
  if (notes) {
    notesBadge = notes.done
      ? `Meeting ${notesName(notes.mode)} ${notes.generating ? 'being made…' : 'posted to the group chat'}`
      : `Recording meeting ${notesName(notes.mode)} · requested by ${myNotes ? 'you' : notesOwner}`;
  }

  let notesLabel = 'Minutes';
  if (notes) notesLabel = notes.done ? 'Notes done' : myNotes ? 'Recording' : `Locked: ${notesOwner}`;

  return (
    <div className="fixed inset-0 z-[80] flex flex-col" style={{ background: '#0b1020' }}>
      {/* top bar */}
      <div className="flex flex-wrap items-center gap-3 px-4 sm:px-6 py-3 text-white">
        <span className="w-2.5 h-2.5 rounded-full bg-rose-500 pulse" />
        <div className="min-w-0">
          <div className="font-extrabold truncate">{project?.name} · Video call</div>
          <div className="text-[12px] text-white/60">{call ? duration(now - call.startedAt) : '00:00'} · {tiles.length} in call</div>
        </div>
        {notes && (
          <span className="badge ml-1" style={{ background: notes.done ? '#064e3b' : '#7f1d1d', color: '#fff' }}>{notesBadge}</span>
        )}
        <div className="ml-auto hidden sm:flex -space-x-2">
          {project?.members.map((m) => <Avatar key={m} id={m} size={28} showOnline />)}
        </div>
      </div>

      <div className="flex-1 min-h-0 flex">
        {/* videos */}
        <div className="flex-1 min-w-0 p-3 sm:p-4 flex flex-col gap-3">
          {presenter ? (
            <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-3">
              <div className="flex-1 min-h-[220px]"><Tile {...presenter} big /></div>
              <div className="lg:w-[240px] flex lg:flex-col gap-3 overflow-auto">
                {others.map((t) => <div key={t.id} className="w-[200px] lg:w-full shrink-0"><Tile {...t} /></div>)}
              </div>
            </div>
          ) : (
            <div className={`flex-1 min-h-0 grid ${gridCols} gap-3 content-center overflow-auto`}>
              {others.map((t) => (
                <div key={t.id} className={others.length === 1 ? 'max-w-[980px] w-full mx-auto' : ''}><Tile {...t} /></div>
              ))}
            </div>
          )}

          {tiles.length === 1 && (
            <div className="text-center text-white/60 text-[12.5px]">
              Waiting for teammates… {notInCall.map((m) => firstName(displayName(userById(d, m)))).join(', ')} will see a <b className="text-white/80">Join call</b> banner.
            </div>
          )}

          {/* live caption under the videos */}
          {notesOn && (speech.interim || lastLine) && (
            <div className="mx-auto max-w-[760px] w-full px-3 py-2 rounded-xl bg-black/50 text-white text-[13px] text-center">
              {speech.interim
                ? <><b>You:</b> {speech.interim}</>
                : <><b>{firstName(lastLine.name)}:</b> {lastLine.text}</>}
            </div>
          )}
        </div>

        {/* side panel */}
        {panel && (
          <aside className="slidein w-full sm:w-[380px] bg-white flex flex-col absolute sm:static inset-0 z-10 sm:z-auto">
            <div className="flex items-center gap-1 p-2 border-b line">
              {[['chat', 'Chat', 'message'], ['notes', 'Minutes', 'notes']].map(([key, label, icon]) => (
                <button key={key} onClick={() => setPanel(key)}
                  className={`btn flex-1 py-2 rounded-lg text-[13px] font-bold inline-flex items-center justify-center gap-2 ${panel === key ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500'}`}>
                  <Icon name={icon} size={15} /> {label}
                </button>
              ))}
              <button onClick={() => setPanel(null)} className="btn p-1 text-slate-400" aria-label="Close panel"><Icon name="x" size={20} /></button>
            </div>

            {panel === 'chat' && <ChatPanel me={me} projectId={projectId} />}

            {panel === 'notes' && (
              <div className="flex-1 min-h-0 flex flex-col">
                <div className="p-4 border-b line text-[12.5px]">
                  {!notes && <p className="muted">Notes are off. Click <b>Minutes</b> below and choose meeting minutes or meeting log. Only one person per call can turn it on.</p>}
                  {notes && (
                    <>
                      <div className="font-bold text-[13.5px]">Meeting {notesName(notes.mode)} · requested by {myNotes ? 'you' : notesOwner}</div>
                      <div className="muted mt-0.5">
                        {notes.done ? 'Finished. Check the group chat.' : `Listening. The ${notesName(notes.mode)} will be posted to the group chat when the call ends.`}
                      </div>
                      {!speech.supported && notesOn && <div className="mt-2 p-2 rounded-lg" style={{ background: '#fffbeb', color: '#92400e' }}>Live transcription needs Chrome or Edge. You can still type notes below.</div>}
                      {speech.error && <div className="mt-2 p-2 rounded-lg" style={{ background: '#fee2e2', color: '#b91c1c' }}>{speech.error}</div>}
                      {!rtc.media.mic && notesOn && <div className="mt-2 p-2 rounded-lg" style={{ background: 'var(--soft3)' }}>You're muted, so your voice isn't being transcribed.</div>}
                      {myNotes && notesOn && (
                        <button onClick={() => finishNotesNow(projectId)} className="btn mt-3 w-full py-2 rounded-xl border line font-bold text-[12.5px]">
                          Stop and post {notesName(notes.mode)} now
                        </button>
                      )}
                    </>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
                  <div className="lbl">LIVE TRANSCRIPT</div>
                  {allLines.map((line, i) => (
                    <div key={i} className="flex gap-2 text-[13px]">
                      <Avatar id={line.who} size={24} />
                      <div>
                        <span className="font-bold">{firstName(line.name)}</span> <span className="text-[11px] muted">{clock(line.at)}</span>
                        {line.typed && <span className="badge ml-1" style={{ background: '#fef3c7', color: '#92400e' }}>note</span>}
                        <div>{line.text}</div>
                      </div>
                    </div>
                  ))}
                  {speech.interim && <div className="text-[13px] muted italic">You: {speech.interim}…</div>}
                  {!allLines.length && !speech.interim && <div className="text-[12.5px] muted">Nothing captured yet.</div>}
                </div>

                {notesOn && (
                  <form className="p-3 border-t line flex gap-2" onSubmit={addNote}>
                    <input value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Add a note, decision or action item…" className="field field-sm flex-1" />
                    <button className="btn px-3 rounded-xl grad text-white font-bold text-[12.5px]">Add</button>
                  </form>
                )}
              </div>
            )}
          </aside>
        )}
      </div>

      {/* buttons */}
      <div className="relative flex flex-wrap justify-center gap-1 sm:gap-4 px-2 sm:px-3 py-3 sm:py-4 border-t border-white/10">
        <CallButton on={rtc.media.mic} onClick={rtc.toggleMic} disabled={!rtc.media.hasMic}
          label={rtc.media.mic ? 'Mute' : 'Unmute'} title={rtc.media.hasMic ? '' : 'No microphone found'}>
          <Icon name={rtc.media.mic ? 'mic' : 'micOff'} size={20} />
        </CallButton>

        <CallButton on={rtc.media.cam} onClick={rtc.toggleCam} disabled={!rtc.media.hasCam}
          label={rtc.media.cam ? 'Camera' : 'Camera off'} title={rtc.media.hasCam ? '' : 'No camera found'}>
          <Icon name={rtc.media.cam ? 'video' : 'videoOff'} size={20} />
        </CallButton>

        <CallButton on={!rtc.media.sharing} onClick={rtc.media.sharing ? rtc.stopShare : rtc.startShare}
          label={rtc.media.sharing ? 'Stop share' : 'Share screen'}
          disabled={!!presenter && !rtc.media.sharing} title={presenter && !rtc.media.sharing ? 'Someone else is presenting' : ''}>
          <Icon name="screen" size={20} />
        </CallButton>

        <div className="relative">
          <CallButton on={!notes} onClick={() => !notes && setNotesMenu(!notesMenu)} disabled={!!notes && !myNotes} label={notesLabel}
            title={notes && !myNotes ? `${notesOwner} already turned on meeting ${notesName(notes.mode)}. Only one person per call can.` : 'Write meeting minutes or a log for this call'}>
            {!notes || notes.done ? <Icon name="notes" size={20} /> : myNotes ? <Icon name="dot" size={20} className="text-rose-500 pulse" /> : <Icon name="lock" size={18} />}
          </CallButton>

          {notesMenu && !notes && (
            <div className="pop absolute bottom-[78px] left-1/2 -translate-x-1/2 w-[280px] card p-3 z-20">
              <div className="font-extrabold text-[14px] mb-1">Meeting notes</div>
              <p className="text-[12px] muted mb-2.5">Listens to the call and posts the result in the group chat when the call ends. Only one person can turn this on.</p>
              {[['minutes', 'Meeting minutes', 'Summary, decisions and action items'], ['log', 'Meeting log', 'Timestamped record of everything said and done']].map(([key, label, info]) => (
                <label key={key} className={`flex gap-2.5 p-2.5 rounded-xl border cursor-pointer mb-2 ${mode === key ? 'border-indigo-400 bg-indigo-50' : 'line'}`}>
                  <input type="radio" name="mode" checked={mode === key} onChange={() => setMode(key)} className="accent-indigo-600 mt-0.5" />
                  <span>
                    <span className="block text-[13px] font-bold">{label}</span>
                    <span className="block text-[11.5px] muted">{info}</span>
                  </span>
                </label>
              ))}
              <button onClick={turnOnNotes} className="btn w-full py-2.5 rounded-xl grad text-white font-bold text-[13px]">Start meeting {notesName(mode)}</button>
            </div>
          )}
        </div>

        <CallButton on={panel !== 'chat'} onClick={() => setPanel(panel === 'chat' ? null : 'chat')} label="Chat">
          <Icon name="message" size={20} />
        </CallButton>
        <CallButton on={panel !== 'notes'} onClick={() => setPanel(panel === 'notes' ? null : 'notes')} label="Transcript">
          <Icon name="captions" size={20} />
        </CallButton>
        <CallButton danger onClick={leave} label="Leave">
          <Icon name="phoneOff" size={20} />
        </CallButton>
      </div>
    </div>
  );
}
