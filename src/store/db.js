// all app data is saved in localStorage for now (no backend yet).
// every tab reads the same data, and the 'storage' event tells other tabs
// when something changes, so two students in two tabs see live updates.
// later this file will call the python backend instead.
import { useSyncExternalStore } from 'react';
import { seedDB } from './seed';
import { uid } from '../lib/format';

const KEY = 'unisync-data';
const SESSION_KEY = 'unisync-session';

function read() {
  try {
    const saved = localStorage.getItem(KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

function save(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (err) {
    console.warn('could not save data', err);
  }
}

let db = read();
if (!db) {
  db = seedDB();
  save(db);
}

const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

// another tab changed the data
window.addEventListener('storage', (e) => {
  if (e.key === KEY) {
    db = e.newValue ? JSON.parse(e.newValue) : seedDB();
    notify();
  }
});

// change the data. we read again first in case another tab saved something
export function update(change) {
  const next = structuredClone(read() || db);
  change(next);
  db = next;
  save(db);
  notify();
}

export const getDB = () => db;

export function resetDemo() {
  localStorage.removeItem(KEY);
  sessionStorage.removeItem(SESSION_KEY);
  location.reload();
}

const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

// react hook to read the data, re-renders when it changes
export function useDB(pick = (d) => d) {
  return pick(useSyncExternalStore(subscribe, () => db));
}

// logged in user. saved in sessionStorage so each tab can be a different student
let session = sessionStorage.getItem(SESSION_KEY);
const sessionListeners = new Set();

export function setSession(userId) {
  session = userId;
  if (userId) sessionStorage.setItem(SESSION_KEY, userId);
  else sessionStorage.removeItem(SESSION_KEY);
  sessionListeners.forEach((fn) => fn());
}

export function useSession() {
  return useSyncExternalStore((fn) => {
    sessionListeners.add(fn);
    return () => sessionListeners.delete(fn);
  }, () => session);
}

export const getSession = () => session;

export const userById = (d, id) =>
  d.users.find((u) => u.id === id) || { id, name: 'Unknown', initials: '?', color: '#94a3b8' };

export const displayName = (u) => u?.nick || u?.name || 'Unknown';

// add a line to a group's live activity.
// 'who' is always the person who did the action (the logged in user),
// not the person the task belongs to. this fixed the bug where abhishek
// moved riya's task but the feed said riya did it.
export function logTeam(d, projectId, who, act) {
  const p = d.projects.find((x) => x.id === projectId);
  if (!p) return;
  p.feed.unshift({ id: uid('f'), who, act, at: Date.now() });
  p.feed = p.feed.slice(0, 200);
}

// add a line to a student's own activity
export function logPersonal(d, userId, act) {
  const list = d.personalFeed[userId] || [];
  list.unshift({ id: uid('f'), who: userId, act, at: Date.now() });
  d.personalFeed[userId] = list.slice(0, 200);
}
