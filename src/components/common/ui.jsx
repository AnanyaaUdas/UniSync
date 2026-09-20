// small components used on many pages
import React, { useEffect, useSyncExternalStore } from 'react';
import { useDB, userById, displayName } from '../../store/db';
import { useOnline } from '../../store/presence';
import Icon from './Icon';

// round profile picture, or coloured initials if there is no picture.
// showOnline adds a green dot when that student is online
export function Avatar({ id, size = 30, ring = true, showOnline = false }) {
  const user = useDB((d) => userById(d, id));
  const online = useOnline();
  const name = displayName(user);
  const circle = `rounded-full shrink-0 ${ring ? 'ring-2 ring-white' : ''}`;
  const dot = Math.max(8, size * 0.3);

  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }} title={name}>
      {user.img ? (
        <img src={user.img} alt={name} style={{ width: size, height: size }} className={`${circle} object-cover`} />
      ) : (
        <span style={{ width: size, height: size, background: user.color }} className={`${circle} text-white grid place-items-center font-bold`}>
          <span style={{ fontSize: size * 0.36 }}>{user.initials}</span>
        </span>
      )}
      {showOnline && online.has(id) && (
        <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-emerald-500 ring-2 ring-white" style={{ width: dot, height: dot }} />
      )}
    </span>
  );
}

// shows "moved **Task** to Done" with the task name in bold
export function RichText({ text }) {
  const parts = String(text).split('**');
  return <>{parts.map((part, i) => (i % 2 ? <b key={i}>{part}</b> : <React.Fragment key={i}>{part}</React.Fragment>))}</>;
}

export const Empty = ({ children }) => (
  <div className="text-center py-10 px-3 text-[13px] rounded-xl border border-dashed muted line">{children}</div>
);

// popup window. closes with esc or by clicking outside
export function Modal({ title, sub, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/45 flex items-end sm:items-center justify-center p-0 sm:p-6"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pop bg-white w-full sm:max-w-[480px] rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 max-h-[92vh] overflow-y-auto">
        <div className="flex items-start gap-3 mb-4">
          <div className="flex-1">
            <h2 className="text-lg font-extrabold tracking-tight">{title}</h2>
            {sub && <p className="text-[12.5px] mt-1 muted">{sub}</p>}
          </div>
          <button onClick={onClose} className="btn p-1 text-slate-400 hover:text-slate-700" aria-label="Close"><Icon name="x" size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// cancel + submit buttons at the bottom of a popup form
export const ModalActions = ({ onCancel, submitLabel }) => (
  <div className="flex gap-2 pt-1">
    <button type="button" onClick={onCancel} className="btn flex-1 py-3 rounded-xl border line font-bold text-[13px]">Cancel</button>
    <button className="btn flex-1 py-3 rounded-xl grad text-white font-bold text-[13px]">{submitLabel}</button>
  </div>
);

// ticks every 15 seconds so "5 minutes ago" texts stay correct
let now = Date.now();
const clockListeners = new Set();
setInterval(() => {
  now = Date.now();
  clockListeners.forEach((fn) => fn());
}, 15000);

export const useNow = () =>
  useSyncExternalStore((fn) => {
    clockListeners.add(fn);
    return () => clockListeners.delete(fn);
  }, () => now);

// small pop up messages in the bottom left corner
let toasts = [];
const toastListeners = new Set();
const refreshToasts = () => toastListeners.forEach((fn) => fn());

export function toast(options) {
  const item = { id: Math.random(), ...options };
  toasts = [...toasts, item].slice(-4); // max 4 at once
  refreshToasts();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== item.id);
    refreshToasts();
  }, options.ms || 4500);
}

export function clearToasts(shouldRemove) {
  toasts = toasts.filter((t) => !shouldRemove(t));
  refreshToasts();
}

export function Toasts() {
  const list = useSyncExternalStore((fn) => {
    toastListeners.add(fn);
    return () => toastListeners.delete(fn);
  }, () => toasts);

  return (
    <div className="fixed bottom-4 left-4 z-[90] space-y-2 w-[calc(100%-2rem)] max-w-[360px]">
      {list.map((t) => (
        <div key={t.id} className="pop card p-3 flex items-center gap-3">
          {t.who ? (
            <Avatar id={t.who} size={30} />
          ) : (
            <span className="w-8 h-8 rounded-xl grid place-items-center" style={{ background: '#e0e7ff', color: '#4338ca' }}>
              <Icon name={t.icon || 'bell'} size={16} />
            </span>
          )}
          <div className="text-[13px] leading-snug flex-1 min-w-0">
            {t.title && <div className="font-bold">{t.title}</div>}
            <div className="muted"><RichText text={t.text} /></div>
          </div>
          {t.action && <button onClick={t.action.run} className="btn px-3 py-1.5 rounded-lg grad text-white text-[12px] font-bold">{t.action.label}</button>}
        </div>
      ))}
    </div>
  );
}

export function Logo({ size = 36, withText = true }) {
  return (
    <div className="flex items-center gap-2.5">
      <img src="/logo.png" alt="UniSync logo" style={{ width: size, height: size }} className="object-contain" />
      {withText && (
        <div className="leading-none">
          <div className="font-extrabold tracking-tight text-[17px]">UniSync</div>
          <div className="text-[11px] muted mt-0.5">Academic & group planner</div>
        </div>
      )}
    </div>
  );
}
