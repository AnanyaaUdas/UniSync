// reads the uploaded module and exam files and finds:
//  - the modules (code and name)
//  - deadlines like assignments, labs, quizzes and presentations
//  - if each piece of coursework is individual or group work
//  - exam dates, times and rooms
// it works by looking for patterns in the text (dates, module codes, key words).
// later the python backend can do this part with a proper ai model.
import { extractText, extractSlides, imageErrors } from './textExtract';
import { PALETTE } from '../lib/constants';
import { uid, dayFromNow, shortFile } from '../lib/format';

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

// codes like CS3040, CS6004NI or CC6012NP. we check the letters around the
// code ourselves (not with \b) because file names use _ between the words,
// like CS6004NI_WEEK01_LECTURE.pptx
const CODE_RE = /(?<![A-Za-z0-9])([A-Z]{2,5})[\s-]?(\d{3,4}[A-Z]{0,2})(?![A-Za-z0-9])/g;
// words in capitals that can have a number after them but are not module codes
const NOT_CODES = new Set(['ISO', 'PAGE', 'ROOM', 'HALL', 'LAB', 'WEEK', 'NO', 'TEL', 'FAX', 'PO', 'BOX', 'YEAR', 'SEM', 'UTC', 'GMT', 'AM', 'PM', 'COVID', 'IEEE', 'RFC',
  'OR', 'AND', 'NOT', 'IN', 'IS', 'TO', 'BY', 'OF', 'AS', 'ON', 'AT', 'IF', 'ID', 'THAN', 'THEN', 'ELSE', 'FROM', 'WHERE', 'LIKE', 'LIMIT', 'SET', 'TOP', 'HTTP', 'HTML', 'UTF', 'SHA', 'MD', 'CW', 'LO', 'STEP', 'PART', 'UNIT', 'LEVEL', 'SLIDE', 'TASK']);

// finds codes like CS3040 in some text
export function findCodes(text) {
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
    .replace(/[_\-–—.|:()[\]]+/g, ' ')
    .replace(/\b(module|outline|handbook|syllabus|brief|course|spec(ification)?|final|v\d+|copy|lecture|week\s?\d*|w\d+)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/(?!^)\b(And|Of|The|To|In|For|With|On)\b/g, (w) => w.toLowerCase()); // "Data and Web Development"

// a line like "Module Name: Application Development". the name can also be
// on the next line
const TITLE_LINE = /\b(module|course|subject|unit)\s*(title|name)\s*[:\-–]\s*(.*)/i;

function nameFromTitleLine(lines) {
  for (let i = 0; i < lines.length; i++) {
    const m = TITLE_LINE.exec(lines[i]);
    if (!m) continue;
    const name = cleanName(m[3]) || cleanName(lines[i + 1] || '');
    if (name.length > 2) return name;
  }
  return '';
}

// lines on a title slide that are not the module name
const LECTURE_LINE = /^(lecture|week|session|tutorial|workshop|lab|chapter|topic|part)\b/i;
const PERSON_LINE = /@|\b(er|dr|mr|mrs|ms|prof|professor|lecturer|tutor)\b\.?\s/i;

const countOf = (phrase, text) => text.toLowerCase().split(phrase.toLowerCase()).length - 1;

// finds the module name on the title slide (the first slide or page).
// lecture slides usually have the module name, the module code and the
// topic of the lecture there
function nameFromTitleSlide(first, code, allText) {
  const lines = first.map((l) => l.trim()).filter(Boolean);
  const at = code ? lines.findIndex((l) => findCodes(l).includes(code)) : -1;

  if (at >= 0) {
    // "CC6012NP Data and Web Development" on one line
    if (cleanName(lines[at]).length > 3) return cleanName(lines[at]);
    // or the name is written above the code, sometimes on 2 lines
    const above = lines.slice(Math.max(0, at - 3), at).filter((l) => !LECTURE_LINE.test(l) && !PERSON_LINE.test(l));
    if (cleanName(above.join(' ')).length > 3) return cleanName(above.join(' '));
  }

  // no code on the slide: take the line that is used most in the rest of the
  // file. the lecture topic and the lecturer are skipped
  let best = '';
  let bestCount = 1;
  lines.forEach((line, i) => {
    const afterLectureLabel = i > 0 && LECTURE_LINE.test(lines[i - 1]) && /[:\-–]$/.test(lines[i - 1]);
    if (LECTURE_LINE.test(line) || PERSON_LINE.test(line) || afterLectureLabel) return;
    if (findCodes(line).length || line.split(/\s+/).length > 7 || !hasWords(line, 4)) return;
    const count = countOf(line, allText);
    if (count > bestCount) {
      best = line;
      bestCount = count;
    }
  });
  return cleanName(best);
}

// some modules run for the whole year (2 semesters) and some for 1 semester.
// the slides say it like "Duration: Year Long (Semester 1 and Semester 2)"
// or "Semester Long Module". when nothing is written we take 1 semester
const YEAR_LONG = /\byear[\s-]*long\b|\bfull[\s-]*year\b|\bsemester\s*1\s*(and|&)\s*(semester\s*)?2\b/i;
const SEMESTER_LONG = /\bsemester[\s-]*long\b|\bsingle[\s-]*semester\b|\bone[\s-]*semester\b/i;

function durationOf(text) {
  if (SEMESTER_LONG.test(text)) return 'semester';
  return YEAR_LONG.test(text) ? 'year' : 'semester';
}

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

// ---------- coursework with no date ----------

// lecture slides often list the coursework without a date, like
// "Coursework 2 (Group Coursework) | 30 | End of Semester 2 (Week 24)" or
// "CW1 (25%) – Research work on a chosen AI topic". we still want these,
// mostly because the group ones have to become group projects
const NUMBERED_WORK = /\b(coursework|cw|assignment)\s*[-#]?\s*(\d)\b/i;

// returns { number, title, due, week } or null
function undatedWork(line) {
  const m = NUMBERED_WORK.exec(line);
  if (!m || line.length > 220) return null;

  // the words after "CW1 (25%) –" describe the work. a table row has no description
  let about = '';
  if (!line.includes('|')) {
    about = line.slice(m.index + m[0].length)
      .replace(/\([^)]*\)/g, ' ')
      .replace(/^[\s:\-–—]+/, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!hasWords(about, 6) || about.length > 70) about = '';
  }

  // "Week 12" gives a rough date. the slides are from week 1, so week 12
  // is about 11 weeks from now. with no week we guess 8 weeks
  const week = +(/\bweek\s*(\d{1,2})\b/i.exec(line)?.[1] || 0);
  const weeksLeft = week ? Math.max(1, week - 1) : 8;

  return {
    number: m[2],
    title: `Coursework ${m[2]}` + (about ? `: ${about.charAt(0).toUpperCase()}${about.slice(1)}` : ''),
    due: dayFromNow(24 * 7 * weeksLeft),
    week,
  };
}

// ---------- modules folder ----------

// the text of a file and the lines of its title slide (first slide or page)
async function readFile(file) {
  if (/\.(pdf|pptx)$/i.test(file.name)) {
    const slides = await extractSlides(file);
    const lines = (s) => [s.title, ...s.lines].filter(Boolean);
    if (slides.length) return { text: slides.map((s) => lines(s).join('\n')).join('\n'), first: lines(slides[0]) };
  }
  const text = await extractText(file);
  return { text, first: text.split('\n').filter((l) => l.trim()).slice(0, 8) };
}

export async function parseModuleFiles(files, onProgress = () => {}) {
  const groups = new Map(); // one group of files for each module
  const warnings = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress(i, file.name);
    const { text, first } = await readFile(file);
    if (!text.trim()) warnings.push(`Couldn't read text from “${file.name}” (scanned image or unsupported type). Its name was still used.`);

    // files are grouped by their sub folder, or by the module code if there is no sub folder
    const path = (file.webkitRelativePath || file.name).split('/');
    const folder = path.length > 2 ? path[1] : null;
    const pageCode = findCodes(first.join('\n'))[0] || findCodes(text.slice(0, 1500))[0];
    const key = folder || findCodes(file.name)[0] || pageCode || file.name;

    if (!groups.has(key)) groups.set(key, { folder, files: [], texts: [], pageCode, first });
    groups.get(key).files.push(file.name);
    groups.get(key).texts.push({ file: file.name, text });
  }

  const modules = [];
  const deadlines = [];
  const seen = new Set();

  for (const group of groups.values()) {
    const allText = group.texts.map((t) => t.text).join('\n');
    const allLines = allText.split('\n');
    // module code: from the folder name, the file name, the title slide,
    // or the code that is written most often in the file
    const code = findCodes(group.folder || '')[0] || findCodes(group.files.join(' '))[0] || group.pageCode || mostCommon(findCodes(allText)) || '';

    // module name: from the folder name, or a "module name:" line, or the
    // title slide, or a line with the code. the file name is the last choice
    let name = '';
    if (group.folder && cleanName(group.folder).length > 2) {
      name = cleanName(group.folder);
    } else {
      const lineWithCode = code && allLines.find((l) => findCodes(l).includes(code) && cleanName(l).length > 3);
      name = nameFromTitleLine(allLines)
        || nameFromTitleSlide(group.first, code, allText)
        || (lineWithCode ? cleanName(lineWithCode) : '')
        || cleanName(group.files[0]);
      name = name.slice(0, 60);
    }
    if (!name) name = code || 'Untitled module';

    const mod = {
      id: uid('m-'),
      code: code || name.slice(0, 6).toUpperCase().replace(/\s/g, ''),
      name,
      color: PALETTE[modules.length % PALETTE.length],
      files: group.files,
      source: 'ai',
      duration: durationOf(allText),
    };
    modules.push(mod);

    const undated = []; // coursework that is listed without a date

    // every line with a date and a deadline word becomes a deadline
    group.texts.forEach(({ file, text }) => {
      const lines = text.split('\n');
      lines.forEach((line, i) => {
        const dates = findDates(line);
        if (!dates.length) {
          const work = undatedWork(line);
          if (work) undated.push({ ...work, file, line, heading: lines[i - 1] || '', text });
          return;
        }
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
          source: shortFile(file),
          keep: true,
          mode: work.mode,
          modeReason: work.reason,
          groupSize: work.size,
        });
      });
    });

    // add the coursework that had no date, if it was not found with a date
    const numbers = new Set();
    undated.forEach((work) => {
      const sameNumber = new RegExp(`\\b(coursework|cw|assignment)\\s*[-#]?\\s*${work.number}\\b`, 'i');
      if (numbers.has(work.number) || deadlines.some((x) => x.mod === mod.id && sameNumber.test(x.title))) return;
      numbers.add(work.number);

      const mode = workModeOf(work.line, work.heading, '');
      deadlines.push({
        id: uid('d-'),
        mod: mod.id,
        title: work.title,
        due: work.due,
        kind: 'coursework',
        confidence: 'low',
        source: shortFile(work.file),
        keep: true,
        mode: mode.mode,
        modeReason: mode.reason,
        groupSize: mode.size,
        dateNote: work.week ? `No date in the file, so this date is a guess from "Week ${work.week}". Please check it` : 'No date in the file, so this date is a guess. Please check it',
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
    const text = await extractText(file, { images: true });
    if (!text.trim()) {
      warnings.push(`Couldn't read text from “${file.name}”. ${imageErrors.get(file.name) || ''} Add its exams manually below.`.replace(/\s+/g, ' '));
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
          source: shortFile(file.name),
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
      exams.push({ id: uid('e-'), sub: subject, code: known?.code || code, date, time, room, source: shortFile(file.name), keep: true });
    });
  }

  exams.sort((a, b) => (a.date < b.date ? -1 : 1));
  return { exams, deadlines, warnings };
}
