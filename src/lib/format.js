// small helper functions for ids, dates and names

export const uid = (prefix = '') => prefix + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

// date (yyyy-mm-dd) that is some hours from now
export const dayFromNow = (hours) => new Date(Date.now() + hours * 3600e3).toISOString().slice(0, 10);

// how many days are left until a date
export const daysTo = (date) => Math.ceil((new Date(date + 'T23:59:59') - Date.now()) / 86400e3);

// 30 Sept 2026
export const fmtDate = (date) =>
  date ? new Date(date + 'T12:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

// 30 Sept
export const fmtShort = (date) =>
  date ? new Date(date + 'T12:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';

// label and colours for how close a deadline is
export function urgency(due) {
  const hours = (new Date(due + 'T23:59:59') - Date.now()) / 3600e3;
  if (hours < 0) return { label: 'Overdue', bg: '#fee2e2', fg: '#b91c1c' };
  if (hours <= 24) return { label: 'Due in 24h', bg: '#fee2e2', fg: '#b91c1c' };
  if (hours <= 168) return { label: 'This week', bg: '#ffedd5', fg: '#c2410c' };
  return { label: 'Later', bg: '#dcfce7', fg: '#15803d' };
}

// "5 minutes ago", "yesterday" etc
export function timeAgo(time, now = Date.now()) {
  const secs = Math.max(0, Math.round((now - time) / 1000));
  if (secs < 10) return 'just now';
  if (secs < 60) return `${secs} seconds ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return mins === 1 ? '1 minute ago' : `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

// 14:05
export const clock = (time) => new Date(time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

// call timer like 05:32 or 1:05:32
export function duration(ms) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

// "Abhishek Rao" -> "AR"
export function initialsOf(name = '') {
  const parts = name.trim().split(/\s+/);
  return ((parts[0] || '?')[0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

export const firstName = (name = '') => name.split(' ')[0];
