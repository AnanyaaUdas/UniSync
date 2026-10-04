// small helpers for the weekly class timetable and its reminders.
// a class looks like { id, day, start, end, title, code, type, room }
// day is 0 for sunday up to 6 for saturday, start and end are like "08:00"

export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const CLASS_TYPES = ['Lecture', 'Tutorial', 'Workshop', 'Lab', 'Seminar'];
export const REMIND_AT = '20:00'; // when the reminder for tomorrow's classes is sent

const byStart = (a, b) => (a.start < b.start ? -1 : 1);

// the classes on the day of this date, earliest first
export const classesOn = (classes, date) => classes.filter((c) => c.day === date.getDay()).sort(byStart);

export function tomorrow(now = Date.now()) {
  const date = new Date(now);
  date.setDate(date.getDate() + 1);
  return date;
}

// "14:05" for a time in ms
export const clockOf = (now) => {
  const date = new Date(now);
  return String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
};

// "08:00 to 09:30"
export const classTime = (c) => (c.end ? `${c.start} to ${c.end}` : c.start);

// "Lecture · LT-08 Vairav Tech"
export const classPlace = (c) => [c.type, c.room && c.room !== 'TBA' ? c.room : 'room not set'].filter(Boolean).join(' · ');
