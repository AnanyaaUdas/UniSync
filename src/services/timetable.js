// reads the uploaded class timetable and finds the weekly classes:
// the day, the time, the module, the type of class and the room.
// it works on timetables that have one class on each row, like
//   Sunday | 08:00 AM - 09:30 AM | Lecture | CS6004NI | Application Development | LT-08 Vairav Tech
// a photo of the timetable is read by the ai backend first (see textExtract.js).
import { extractRows, imageErrors } from './textExtract';
import { findCodes } from './aiParser';
import { uid, shortFile } from '../lib/format';

const DAY_RE = /\b(sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?)\b/i;
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const TIME_RE = /(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\s*(?:-|–|—|to)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?/i;
const TYPE_RE = /\b(lecture|tutorial|workshop|lab|practical|seminar)\b/i;
const ROOM_RE = /\b(hall|room|lab|block|venue|rm|lt|tr|sr|lr)\s*[:\-]?\s*\d[\w-]{0,5}\b|\b(hall|room|block)\s+[a-z]\b/i;
const PERSON_RE = /^(mr|mrs|ms|miss|dr|er|prof|sir)\b\.?/i;

const pad = (n) => String(n).padStart(2, '0');

// turns the 2 times into 24 hour times like ["08:00", "13:30"]
function times(m) {
  let [h1, h2] = [+m[1], +m[4]];
  const [min1, min2] = [+(m[2] || 0), +(m[5] || 0)];
  let ap1 = (m[3] || '').toLowerCase();
  const ap2 = (m[6] || '').toLowerCase();
  if (h1 > 23 || h2 > 23 || min1 > 59 || min2 > 59) return null;

  const fix = (h, ap) => (ap === 'pm' && h < 12 ? h + 12 : ap === 'am' && h === 12 ? 0 : h);
  if (ap2 && !ap1) {
    // "11:00 - 1:00 pm": the start has the same am/pm unless that puts it after the end
    ap1 = fix(h1, ap2) <= fix(h2, ap2) ? ap2 : 'am';
  }
  if (!ap1 && !ap2) {
    // no am or pm written. classes are not before 7, so 1:00 means 13:00
    if (h1 < 7) h1 += 12;
    if (h2 < 7 || h2 < h1) h2 += 12;
  } else {
    h1 = fix(h1, ap1);
    h2 = fix(h2, ap2 || ap1);
  }
  if (h1 > 23 || h2 > 23) return null;
  return [`${pad(h1)}:${pad(min1)}`, `${pad(h2)}:${pad(min2)}`];
}

const tidy = (text) => text.replace(/\s+/g, ' ').replace(/^[\s\-–:,|]+|[\s\-–:,|]+$/g, '').trim();
const letters = (text) => text.replace(/[^a-z]/gi, '').length;

export async function parseTimetableFiles(files, onProgress = () => {}, knownModules = []) {
  const classes = [];
  const warnings = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress(i, file.name);
    const lines = await extractRows(file);
    const before = classes.length;
    let day = -1; // the day is often written once, above or beside its classes

    lines.forEach((line) => {
      const dayWord = DAY_RE.exec(line);
      if (dayWord) day = DAY_KEYS.indexOf(dayWord[1].slice(0, 3).toLowerCase());

      const time = TIME_RE.exec(line);
      // a real time has minutes or am/pm, "3 - 1" is not a time
      if (!time || !(time[2] || time[3] || time[5] || time[6]) || day < 0) return;
      const range = times(time);
      if (!range) return;

      // what is left after the day and the time, cut into the table cells
      let rest = line.replace(time[0], '  ');
      if (dayWord) rest = rest.replace(dayWord[0], '  ');
      const cells = rest.split(/\s{2,}|\s*\|\s*/).map(tidy).filter(Boolean);

      const type = TYPE_RE.exec(rest)?.[1] || '';
      const code = findCodes(rest)[0] || '';
      const roomCell = cells.find((c) => ROOM_RE.test(c) && !new RegExp(`^${type}$`, 'i').test(c));
      const known = knownModules.find((m) => (code && m.code === code) || (m.name && rest.toLowerCase().includes(m.name.toLowerCase())));

      // the module name is the longest cell that is not the code, type, room or lecturer
      let title = known?.name || '';
      if (!title) {
        const names = cells
          .map((c) => tidy(c.replace(code, ' ').replace(/\(?\b(lecture|tutorial|workshop|practical|seminar)\b\)?/gi, ' ')))
          .filter((c) => c !== roomCell && !PERSON_RE.test(c) && !/^(lecture|tutorial|workshop|lab|practical|seminar)$/i.test(c) && letters(c) >= 4 && !/^\w*\d\w*$/.test(c));
        title = names.sort((a, b) => b.length - a.length)[0] || code;
      }
      if (!title) return;

      const item = {
        id: uid('k-'),
        day,
        start: range[0],
        end: range[1],
        title: title.slice(0, 60),
        code: known?.code || code,
        type: type ? type[0].toUpperCase() + type.slice(1).toLowerCase() : 'Lecture',
        room: roomCell ? roomCell.slice(0, 40) : 'TBA',
        source: shortFile(file.name),
        keep: true,
      };
      if (classes.some((c) => c.day === item.day && c.start === item.start && c.title.toLowerCase() === item.title.toLowerCase())) return;
      classes.push(item);
    });

    if (classes.length === before && imageErrors.has(file.name)) {
      warnings.push(`Couldn't read “${file.name}”. ${imageErrors.get(file.name)} Add your classes below.`);
    } else if (classes.length === before) warnings.push(`Couldn't find classes in “${file.name}”. It works when each class is on its own row with the day and the time. Add your classes below.`);
  }

  classes.sort((a, b) => a.day - b.day || (a.start < b.start ? -1 : 1));
  return { classes, warnings };
}
