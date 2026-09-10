// shows who is online. every open tab sends a small "beat" message
// every few seconds to the other tabs. if we don't hear from a tab
// for 7 seconds we treat that student as offline.
import { useSyncExternalStore } from 'react';
import { uid } from '../lib/format';

const TAB_ID = uid('tab-');
const channel = new BroadcastChannel('unisync-presence');

let me = null; // user id logged in on this tab
let tabs = {}; // other tabs: tabId -> { userId, lastSeen }
let online = new Set();
const listeners = new Set();

function refresh() {
  const now = Date.now();
  const next = new Set();
  Object.entries(tabs).forEach(([id, t]) => {
    if (now - t.lastSeen < 7000) next.add(t.userId);
    else delete tabs[id];
  });
  if (me) next.add(me);

  const changed = next.size !== online.size || [...next].some((u) => !online.has(u));
  if (changed) {
    online = next;
    listeners.forEach((fn) => fn());
  }
}

function beat() {
  if (me) channel.postMessage({ type: 'beat', tab: TAB_ID, userId: me });
  refresh();
}

channel.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === 'beat') tabs[msg.tab] = { userId: msg.userId, lastSeen: Date.now() };
  if (msg.type === 'bye') delete tabs[msg.tab];
  if (msg.type === 'hello' && me) beat();
  refresh();
};

setInterval(beat, 2500);
window.addEventListener('beforeunload', () => channel.postMessage({ type: 'bye', tab: TAB_ID }));

// called when someone logs in or out on this tab
export function setPresenceUser(userId) {
  if (me && me !== userId) channel.postMessage({ type: 'bye', tab: TAB_ID });
  me = userId;
  channel.postMessage({ type: 'hello' });
  beat();
}

export function useOnline() {
  return useSyncExternalStore((fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, () => online);
}
