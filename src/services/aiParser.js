// reads the uploaded module and exam files and finds:
//  - the modules (code and name)
//  - deadlines like assignments, labs, quizzes and presentations
//  - if each piece of coursework is individual or group work
//  - exam dates, times and rooms
// it works by looking for patterns in the text (dates, module codes, key words).
// later the python backend can do this part with a proper ai model.
import { extractText } from './textExtract';
import { PALETTE } from '../lib/constants';
import { uid } from '../lib/format';

// ---------- dates ----------

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const monthIndex = (name) => MONTHS.indexOf(name.slice(0, 3).toLowerCase());

// makes a yyyy-mm-dd string, or null if the date is not real
function makeDate(year, month, day) {
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  if (year == null) {
    // no year written, so use this year, or next year if the date has passed
    const now = new Date();
    year = now.getFullYear();
    if (new Date(year, month, day) < new Date(now.getTime() - 30 * 86400e3)) year += 1;
  } else if (year < 100) {
    year += 2000;
  }
  if (year < 2000 || year > 2100) return null;
  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCDate() !== day) return null; // like 31 feb
  return date.toISOString().slice(0, 10);
}

// the date formats we understand
const DATE_PATTERNS = [
  // 2026-10-12
  { re: /\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/g, toDate: (m) => makeDate(+m[1], +m[2] - 1, +m[3]) },
  // 12/10/2026 (day first, but 10/25/2026 is also fine)
  {
    re: /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/g,
    toDate: (m) => {
      let day = +m[1];
      let month = +m[2];
      if (month > 12 && day <= 12) [day, month] = [month, day];
      return makeDate(+m[3], month - 1, day);
    },
  },
  // 12 October 2026, 12th Oct
  { re: new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH}\\.?,?(?:\\s+(\\d{4}))?\\b`, 'gi'), toDate: (m) => makeDate(m[3] ? +m[3] : null, monthIndex(m[2]), +m[1]) },
  // October 12, 2026
  { re: new RegExp(`\\b${MONTH}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?(?:\\s+(\\d{4}))?\\b`, 'gi'), toDate: (m) => makeDate(m[3] ? +m[3] : null, monthIndex(m[1]), +m[2]) },
];

// returns every date in a line with where it starts and ends
function findDates(line) {
  const found = [];
  DATE_PATTERNS.forEach(({ re, toDate }) => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(line))) {
      const iso = toDate(m);
      const start = m.index;
      const end = start + m[0].length;
      const overlaps = found.some((f) => start < f.end && end > f.start);
      if (iso && !overlaps) found.push({ iso, start, end });
    }
  });
  return found.sort((a, b) => a.start - b.start);
}

// removes the dates from a line so only the words are left
function removeDates(line, dates) {
  let text = line;
  [...dates].reverse().forEach((d) => {
    text = text.slice(0, d.start) + ' ' + text.slice(d.end);
  });
  return text;
}

// ---------- module codes and names ----------

const CODE_RE = /\b([A-Z]{2,5})[\s-]?(\d{3,4}[A-Z]?)\b/g;
const NOT_CODES = new Set(['ISO', 'PAGE', 'ROOM', 'HALL', 'LAB', 'WEEK', 'NO', 'TEL', 'FAX', 'PO', 'BOX', 'YEAR', 'SEM', 'UTC', 'GMT', 'AM', 'PM', 'COVID', 'IEEE', 'RFC']);

// finds codes like CS3040 in some text
function findCodes(text) {
  const codes = [];
  CODE_RE.lastIndex = 0;
  let m;
  while ((m = CODE_RE.exec(text))) {
    if (NOT_CODES.has(m[1])) continue;
    if (/^(19|20)\d\d$/.test(m[2])) continue; // it's a year, not a code
    codes.push(m[1] + m[2]);
  }
  return codes;
}

// turns "CS3040 software_engineering-outline.pdf" into "Software Engineering"
const cleanName = (text) =>
  text
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(CODE_RE, ' ')
    .replace(/\b(module|outline|handbook|syllabus|brief|course|spec(ification)?|final|v\d+|copy)\b/gi, ' ')
    .replace(/[_\-–—.|:()[\]]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

const TITLE_LINE = /(module|course|subject|unit)\s*(title|name)?\s*[:\-–]\s*(.+)/i;

function mostCommon(list) {
  const count = {};
  list.forEach((x) => (count[x] = (count[x] || 0) + 1));
  return Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0];
}

// ---------- what kind of deadline is it ----------

const KINDS = [
  ['quiz', /\b(quiz|class test|test|mid-?term|midsem)\b/i],
  ['presentation', /\b(presentation|viva|demo|pitch|poster)\b/i],
  ['lab', /\b(lab|practical|tutorial|worksheet|sheet)\b/i],
  ['project', /\b(project|milestone|prototype|sprint)\b/i],
  ['coursework', /\b(coursework|cw\s?\d|essay|report|portfolio)\b/i],
  ['assignment', /\b(assignment|homework|submission|submit|hand-?in|due|deadline)\b/i],
  ['reading', /\b(read|reading|chapter)\b/i],
];
// words that tell us a date is a deadline
const DEADLINE_WORDS = /\b(due|deadline|submit|submission|hand-?in|assignment|coursework|cw\s?\d|lab|quiz|test|presentation|viva|demo|report|project|milestone|essay|practical|portfolio|mid-?term)\b/i;
const SURE_WORDS = /\b(due|deadline|submit|submission|hand-?in)\b/i;

// checks the line first, then the line above it
function kindOf(line, above = '') {
  const match = KINDS.find(([, re]) => re.test(line)) || KINDS.find(([, re]) => re.test(above));
  return match ? match[0] : 'assignment';
}

// ---------- group or individual ----------

const GROUP_WORDS = /\b(group|groups|team|teams|pair|pairs|in pairs|collaborative|jointly|peer project|group-?work|capstone team)\b/i;
const SOLO_WORDS = /\b(individual(ly)?|solo|each student|on your own|independent(ly)?|personal)\b/i;

// looks at the deadline line, then the heading above it, then the whole document
function workModeOf(line, heading, docText) {
  const both = line + ' ' + heading;
  const size = /\bgroups? of (\d{1,2})\b/i.exec(both)?.[1] || (/\bpairs?\b/i.test(both) ? '2' : null);

  if (SOLO_WORDS.test(line)) return { mode: 'personal', reason: 'The brief says this is individual work', size: null };
  if (GROUP_WORDS.test(line)) return { mode: 'team', reason: 'The brief says this is group work', size };
  if (SOLO_WORDS.test(heading)) return { mode: 'personal', reason: 'Listed under individual work', size: null };
  if (GROUP_WORDS.test(heading)) return { mode: 'team', reason: 'Listed under group work', size };
  if (/\b(presentation|demo|viva)\b/i.test(line) && /\bgroup\b/i.test(docText)) {
    return { mode: 'team', reason: 'Presentation in a module with group work', size };
  }
  return { mode: 'personal', reason: 'No group work mentioned, so treated as individual', size: null };
}

// ---------- deadline title ----------

// cleans a line like "Lab 5 (individual): CNN tuning - submit by 06 Oct 2026"
// into "Lab 5: CNN tuning"
function titleFrom(line, dates, lineAbove) {
  let title = removeDates(line, dates)
    .replace(/\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?/gi, ' ')
    .replace(/\b(\d{1,2}[:.]\d{2})\s*(am|pm)?/gi, ' ')
    .replace(/\(\s*(individual(ly)?|solo|pairs?|in pairs|team|group[^)]*)\s*\)/gi, ' ')
    .replace(/[|•●▪·]+/g, ' ')
    .replace(/(\s*[-–:,]?\s*\b(submit(ted)?|submission( date| deadline)?|hand-?in|due( date)?|deadline|by|on|before|at)\b\s*[:\-–]?\s*)+$/i, '')
    .replace(/^\s*[\d.)\-–:]+\s*/, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([:,])/g, '$1')
    .replace(/\s*[-–:]\s*(final( submission)?)?\s*$/i, '')
    .trim();

  // if almost nothing is left, the title is probably on the line above
  if (title.replace(/[^a-z]/gi, '').length < 5 && lineAbove) title = lineAbove.trim();
  if (title.length > 90) title = title.slice(0, 87).trimEnd() + '…';
  return title.charAt(0).toUpperCase() + title.slice(1);
}

const hasWords = (text, min) => text.replace(/[^a-z]/gi, '').length >= min;

// line above, but only if it's a heading (no date in it)
const headingAbove = (lines, i) => (lines[i - 1] && !findDates(lines[i - 1]).length ? lines[i - 1] : '');

// ---------- modules folder ----------

export async function parseModuleFiles(files, onProgress = () => {}) {
  const groups = new Map(); // one group of files for each module
  const warnings = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress(i, file.name);
    const text = await extractText(file);
    if (!text.trim()) warnings.push(`Couldn't read text from “${file.name}” (scanned image or unsupported type). Its name was still used.`);

    // files are grouped by their sub folder, or by the module code if there is no sub folder
    const path = (file.webkitRelativePath || file.name).split('/');
    const folder = path.length > 2 ? path[1] : null;
    const key = folder || findCodes(file.name)[0] || findCodes(text.slice(0, 1500))[0] || file.name;

    if (!groups.has(key)) groups.set(key, { folder, files: [], texts: [] });
    groups.get(key).files.push(file.name);
    groups.get(key).texts.push({ file: file.name, text });
  }

  const modules = [];
  const deadlines = [];
  const seen = new Set();

  for (const group of groups.values()) {
    const allText = group.texts.map((t) => t.text).join('\n');
    const allLines = allText.split('\n');
    const code = findCodes(group.folder || '')[0] || findCodes(group.files.join(' '))[0] || mostCommon(findCodes(allText)) || '';

    // module name: from the folder name, or a "module title:" line, or a line with the code
    let name = '';
    const titleLine = allLines.map((l) => TITLE_LINE.exec(l)).find(Boolean);
    if (group.folder && cleanName(group.folder).length > 2) {
      name = cleanName(group.folder);
    } else if (titleLine) {
      name = cleanName(titleLine[3]).slice(0, 60);
    } else {
      const lineWithCode = code && allLines.find((l) => findCodes(l).includes(code) && cleanName(l).length > 3);
      name = lineWithCode ? cleanName(lineWithCode).slice(0, 60) : cleanName(group.files[0]);
    }
    if (!name) name = code || 'Untitled module';

    const mod = {
      id: uid('m-'),
      code: code || name.slice(0, 6).toUpperCase().replace(/\s/g, ''),
      name,
      color: PALETTE[modules.length % PALETTE.length],
      files: group.files,
      source: 'ai',
    };
    modules.push(mod);

    // every line with a date and a deadline word becomes a deadline
    group.texts.forEach(({ file, text }) => {
      const lines = text.split('\n');
      lines.forEach((line, i) => {
        const dates = findDates(line);
        if (!dates.length) return;
        const withAbove = line + ' ' + (lines[i - 1] || '');
        if (!DEADLINE_WORDS.test(withAbove)) return;

        const title = titleFrom(line, dates, lines[i - 1]);
        if (!title || !hasWords(title, 4)) return;

        const due = dates[dates.length - 1].iso;
        const key = `${mod.id}|${due}|${title.toLowerCase().slice(0, 24)}`;
        if (seen.has(key)) return;
        seen.add(key);

        const work = workModeOf(line, headingAbove(lines, i), text);
        deadlines.push({
          id: uid('d-'),
          mod: mod.id,
          title,
          due,
          kind: kindOf(line, withAbove),
          confidence: SURE_WORDS.test(withAbove) ? 'high' : 'medium',
          source: file,
          keep: true,
          mode: work.mode,
          modeReason: work.reason,
          groupSize: work.size,
        });
      });
    });
  }

  return { modules, deadlines, warnings };
}

// ---------- exam schedule folder ----------

const TIME_RANGE = /\b(\d{1,2}[:.]\d{2})\s*(am|pm)?\s*(?:-|–|—|to)\s*(\d{1,2}[:.]\d{2})\s*(am|pm)?/i;
const ONE_TIME = /\b(\d{1,2}[:.]\d{2})\s*(am|pm)?\b/i;
const ROOM = /\b(hall|room|lab|block|venue|rm)\s*[:\-]?\s*([A-Z0-9][A-Z0-9-]{0,5})\b/i;
const COURSEWORK_WORDS = /\b(due|deadline|submit|submission|hand-?in|assignment|coursework|project|presentation|report|essay|portfolio)\b/i;
const EXAM_WORDS = /\b(exam|examination|final paper|paper [ivx\d]+|mid-?term exam|board exam)\b/i;

// "09.00 am" -> "09:00 am"
const fixTime = (t, ampm) => t.replace('.', ':') + (ampm ? ' ' + ampm : '');

export async function parseExamFiles(files, onProgress = () => {}, knownModules = []) {
  const exams = [];
  const deadlines = [];
  const warnings = [];

  const findModule = (text, code) =>
    knownModules.find((m) => (code && m.code === code) || (m.name && text.toLowerCase().includes(m.name.toLowerCase())));

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress(i, file.name);
    const text = await extractText(file);
    if (!text.trim()) {
      warnings.push(`Couldn't read text from “${file.name}”. Add its exams manually below.`);
      continue;
    }

    const lines = text.split('\n');
    lines.forEach((line, n) => {
      const dates = findDates(line);
      if (!dates.length) return;

      // coursework dates can be in the same pdf as the exam routine
      if (COURSEWORK_WORDS.test(line) && !EXAM_WORDS.test(line) && !TIME_RANGE.test(line)) {
        const title = titleFrom(line, dates, lines[n - 1]);
        if (!title || !hasWords(title, 4)) return;

        const code = findCodes(line)[0] || '';
        const known = findModule(line, code);
        const moduleName = known?.name || (line.includes(':') ? cleanName(line.split(':')[0].replace(code, '')) : '');

        // remove "CS2450 Operating Systems:" from the start of the title
        let shortTitle = title.replace(new RegExp(`^${code}\\s*[:\\-–]?\\s*`), '');
        if (moduleName && shortTitle.toLowerCase().startsWith(moduleName.toLowerCase())) {
          shortTitle = shortTitle.slice(moduleName.length).replace(/^\s*[:\-–]\s*/, '');
        }

        const work = workModeOf(line, headingAbove(lines, n), text);
        deadlines.push({
          id: uid('d-'),
          mod: known?.id || null,
          modHint: { code, name: moduleName },
          title: shortTitle.charAt(0).toUpperCase() + shortTitle.slice(1),
          due: dates[dates.length - 1].iso,
          kind: kindOf(line),
          confidence: SURE_WORDS.test(line) ? 'high' : 'medium',
          source: file.name,
          keep: true,
          mode: work.mode,
          modeReason: work.reason,
          groupSize: work.size,
        });
        return;
      }

      // otherwise it's an exam row: take out the time and room, what's left is the subject
      let rest = removeDates(line, dates);

      const t = TIME_RANGE.exec(rest) || ONE_TIME.exec(rest);
      let time = 'TBA';
      if (t) {
        time = t[3] ? `${fixTime(t[1], t[2])} to ${fixTime(t[3], t[4])}` : fixTime(t[1], t[2]);
        rest = rest.replace(t[0], ' ');
      }

      const r = ROOM.exec(rest);
      let room = 'TBA';
      if (r) {
        room = r[1][0].toUpperCase() + r[1].slice(1).toLowerCase() + ' ' + r[2];
        rest = rest.replace(r[0], ' ');
      }

      const code = findCodes(rest)[0] || '';
      const known = findModule(rest, code);
      let subject = known
        ? known.name
        : cleanName(rest.replace(/\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?\b/gi, ' ').replace(/\b(exam(ination)?|final|paper|date|time|subject|sn|s\.n)\b/gi, ' '));

      // subject might be on the line above
      if (!hasWords(subject, 3) && !findDates(lines[n - 1] || '').length) subject = cleanName(lines[n - 1] || '');
      if (!hasWords(subject, 3)) return;
      if (subject.length > 60) subject = subject.slice(0, 57) + '…';

      const date = dates[0].iso;
      if (exams.some((e) => e.date === date && e.sub.toLowerCase() === subject.toLowerCase())) return;
      exams.push({ id: uid('e-'), sub: subject, code: known?.code || code, date, time, room, source: file.name, keep: true });
    });
  }

  exams.sort((a, b) => (a.date < b.date ? -1 : 1));
  return { exams, deadlines, warnings };
}
