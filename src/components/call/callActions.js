// everything about a call that all tabs need to know is saved here:
// who is in the call, who turned on meeting notes, the transcript and events.
// only one person can turn on meeting notes in a call. later the backend
// should also check this on the server.
import { update, logTeam, userById, displayName } from '../../store/db';
import { uid } from '../../lib/format';
import { api } from '../../services/api';
import { generateMeetingNotes } from '../../services/meetingNotes';

// if a tab hasn't said "still here" for 20 seconds, it probably closed
const TIMEOUT = 20000;

const nameOf = (d, id) => displayName(userById(d, id));
const notesName = (mode) => (mode === 'log' ? 'log' : 'minutes');

function removeOldPeople(call) {
  Object.entries(call.participants).forEach(([peerId, p]) => {
    if (Date.now() - p.lastSeen > TIMEOUT) delete call.participants[peerId];
  });
}

export function joinCall(projectId, me, peerId) {
  update((d) => {
    let call = d.calls[projectId];
    if (call) removeOldPeople(call);
    // old empty call left behind, start a new one
    if (call && !Object.keys(call.participants).length && !call.notes) call = null;

    if (!call) {
      call = {
        id: uid('call-'),
        startedBy: me,
        startedAt: Date.now(),
        participants: {},
        attendees: [],
        notes: null,
        transcript: [],
        manual: [],
        events: [],
      };
      d.calls[projectId] = call;
      const project = d.projects.find((p) => p.id === projectId);
      project.chat.push({ id: uid('c'), type: 'system', who: me, txt: `${nameOf(d, me)} started a video call`, at: Date.now() });
      logTeam(d, projectId, me, 'started a **video call**');
    }

    call.participants[peerId] = { userId: me, lastSeen: Date.now() };
    if (!call.attendees.includes(me)) call.attendees.push(me);
    call.events.push({ type: 'join', who: me, text: `${nameOf(d, me)} joined the call`, at: Date.now() });
  });
}

// each tab calls this every few seconds to say it's still in the call
export function stillHere(projectId, peerId) {
  update((d) => {
    const call = d.calls[projectId];
    if (!call) return;
    if (call.participants[peerId]) call.participants[peerId].lastSeen = Date.now();
    removeOldPeople(call);
  });
}

export function addEvent(projectId, me, type, text) {
  update((d) => {
    const call = d.calls[projectId];
    if (call) call.events.push({ type, who: me, text, at: Date.now() });
  });
}

// turn on meeting notes. if someone already did, it returns who
export function startNotes(projectId, me, peerId, mode) {
  let result = { ok: false, holder: null };
  update((d) => {
    const call = d.calls[projectId];
    if (!call) return;
    if (call.notes) {
      result = { ok: false, holder: call.notes.by };
      return;
    }
    call.notes = { by: me, byPeer: peerId, mode, done: false };
    call.events.push({ type: 'notes', who: me, text: `${nameOf(d, me)} turned on meeting ${notesName(mode)}`, at: Date.now() });
    logTeam(d, projectId, me, `turned on **meeting ${notesName(mode)}** for the call`);
    result = { ok: true, holder: me };
  });
  return result;
}

export function addTranscript(projectId, me, text) {
  update((d) => {
    const call = d.calls[projectId];
    if (!call?.notes || call.notes.done) return;
    call.transcript.push({ who: me, name: nameOf(d, me), text, at: Date.now() });
  });
}

export function addManualNote(projectId, me, text) {
  update((d) => {
    const call = d.calls[projectId];
    if (!call?.notes || call.notes.done) return;
    call.manual.push({ who: me, name: nameOf(d, me), text, at: Date.now() });
  });
}

// everything needed to make the minutes
function notesData(d, projectId, call) {
  const project = d.projects.find((p) => p.id === projectId);
  return {
    mode: call.notes.mode,
    transcript: call.transcript,
    manualNotes: call.manual,
    events: call.events,
    by: call.notes.by,
    meta: {
      project: project?.name || 'Project',
      startedAt: call.startedAt,
      endedAt: Date.now(),
      participants: call.attendees.map((u) => nameOf(d, u)),
      takenBy: nameOf(d, call.notes.by),
    },
  };
}

// make the minutes/log and put them in the group chat.
// when the tab is closing we can't wait, so we make them straight away
async function postNotes(projectId, data, closing = false) {
  const notes = closing ? generateMeetingNotes(data) : await api.meetingNotes(data);
  update((d) => {
    const project = d.projects.find((p) => p.id === projectId);
    if (!project) return;
    project.chat.push({ id: uid('c'), type: 'meeting-notes', who: data.by, at: Date.now(), notes: { ...notes, mode: data.mode } });
    logTeam(d, projectId, data.by, `posted the **meeting ${notesName(data.mode)}** to the group chat`);
  });
}

// "stop and post now" button, only for the person who turned notes on
export async function finishNotesNow(projectId) {
  let data = null;
  update((d) => {
    const call = d.calls[projectId];
    if (!call?.notes || call.notes.done) return;
    call.notes.done = true;
    call.notes.generating = true;
    data = notesData(d, projectId, call);
  });
  if (data) await postNotes(projectId, data);
  update((d) => {
    const call = d.calls[projectId];
    if (call?.notes) call.notes.generating = false;
  });
}

// leave the call. if i'm the last one, the call ends and the
// minutes/log are made (if meeting notes were turned on)
export async function leaveCall(projectId, me, peerId, closing = false) {
  let data = null;
  update((d) => {
    const call = d.calls[projectId];
    if (!call) return;
    delete call.participants[peerId];
    removeOldPeople(call);
    call.events.push({ type: 'leave', who: me, text: `${nameOf(d, me)} left the call`, at: Date.now() });

    if (Object.keys(call.participants).length) return; // others are still in the call

    if (call.notes && !call.notes.done) data = notesData(d, projectId, call);
    const mins = Math.max(1, Math.round((Date.now() - call.startedAt) / 60000));
    const people = call.attendees.length;
    const project = d.projects.find((p) => p.id === projectId);
    project?.chat.push({ id: uid('c'), type: 'system', who: me, txt: `Call ended · ${mins} min · ${people} attendee${people === 1 ? '' : 's'}`, at: Date.now() });
    delete d.calls[projectId];
  });
  if (data) await postNotes(projectId, data, closing);
}

// a call only counts if someone in it was active in the last 20 seconds
export function liveCall(call) {
  if (!call) return null;
  return Object.values(call.participants).some((p) => Date.now() - p.lastSeen < TIMEOUT) ? call : null;
}
