// makes multiple choice questions (mcqs) from the study material a student
// uploads on the Study page: lecture slides, tutorial sheets and workshop
// sheets. deadlines and exam dates are not used here.
//
// there are 2 ways the questions are made:
//
// 1. with ai (the normal way). the slides are read in the browser, their
//    text is sent to our backend, and google gemini writes the questions,
//    the 4 options and a short explanation (see ai.js and backend/main.py).
//
// 2. basic questions (only when the ai backend is not running, or fails).
//    made in the browser with patterns in the text:
//      facts:     definitions "Normalisation is the process of ...",
//                 slide titles with their bullet points, and questions in
//                 a sheet that have an "Answer:" line
//      questions: every fact becomes a question. the right option comes
//                 from the fact, the 3 wrong options from other facts
//    these follow the wording of the slides and are much weaker.
import { extractSlides } from './textExtract';
import { aiQuestions } from './ai';
import { uid } from '../lib/format';

const MAX_PER_FILE = 60;
const OPTION_LENGTH = 170;

const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const lower = (text) => (/^[A-Z][a-z]/.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text); // keeps "SQL joins"
// removes bullets and numbering from the start of a line
const clean = (text) => text.replace(/\s+/g, ' ').replace(/^[\s•●▪■□◦○·➢➤✓\-–*]+/, '').replace(/^\(?\d{1,2}[.)]\s+/, '').trim();
// an option is one short line with no full stop at the end
const asOption = (text) => {
  const line = capital(text.trim().replace(/[.;,]$/, ''));
  return line.length > OPTION_LENGTH ? line.slice(0, OPTION_LENGTH - 1).trimEnd() + '…' : line;
};
const same = (a, b) => a.toLowerCase() === b.toLowerCase();

// true when 2 options say nearly the same thing (most of their words are
// shared). such an option can't be used as a wrong answer
function tooClose(a, b) {
  const words = (text) => new Set(text.toLowerCase().match(/[a-z0-9]{3,}/g) || []);
  const one = words(a);
  const two = words(b);
  const shared = [...one].filter((w) => two.has(w)).length;
  return same(a, b) || (Math.min(one.size, two.size) >= 3 && shared / Math.min(one.size, two.size) >= 0.7);
}

export function shuffle(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// the kinds of study material a student can upload
export const MATERIALS = { lecture: 'Lecture slides', tutorial: 'Tutorial', workshop: 'Workshop' };

// guess the kind from the file name
export function materialOf(name) {
  if (/tutorial|\btut\b|tut\d|worksheet|exercise|problem[ _-]?set|seminar/i.test(name)) return 'tutorial';
  if (/workshop|\blab\b|lab\d|practical/i.test(name)) return 'workshop';
  return 'lecture';
}

// ---------- step 1: facts ----------

// "X is ...", "X are ...", "X refers to ...", "X means ..."
const DEFINITION = /^(an?\s+|the\s+)?([A-Za-z][\w\-/() ]{2,48}?)\s+(is|are|refers to|means|is defined as|can be defined as|describes)\s+(.{20,300})$/i;
// "Term: explanation" or "Term - explanation"
const GLOSSARY = /^([A-Z][\w\-/() ]{2,40}?)\s*(?::|\s[-–]\s)\s*([A-Za-z].{25,300})$/;
// words that start a sentence but are not a term
const NOT_A_TERM = /^(this|that|these|those|it|there|here|he|she|we|you|they|i|what|which|who|when|where|why|how|if|each|every|all|any|some|your|our|their|its|note|please|students?|example|e\.g|answer|solution|hint|question|task|step|aim|objective|today|next week|last week|week|lecture|tutorial|workshop|lab|module|reading|the (aim|goal|idea|answer|result|problem|following|example|question|task|lecture|module))\b/i;

// { term, article, plural, text } or null. text is the meaning without the term
function definitionIn(line) {
  if (line.length < 30 || line.length > 340) return null;
  const def = DEFINITION.exec(line);
  const glossary = !def && GLOSSARY.exec(line);
  if (!def && !glossary) return null;

  const term = (def ? def[2] : glossary[1]).trim();
  const text = def ? def[4] : glossary[2];
  if (NOT_A_TERM.test(term) || term.split(' ').length > 5 || text.split(' ').length < 5) return null;
  return {
    term,
    article: def ? (def[1] || '').toLowerCase() : '', // "a ", "an " or "the "
    plural: def ? /^are$/i.test(def[3]) : false,
    glossary: !!glossary,
    text: asOption(text),
  };
}

// slides that have nothing to learn on them
const SKIP_SLIDE = /^(agenda|outline|contents?|overview|today|this week|next week|questions?\??|any questions\??|q ?(&|and) ?a|thank(s| you).*|references?|bibliography|further reading|reading( list)?|recap|learning outcomes?|objectives?|aims?|admin(istration)?|housekeeping|announcements?|assessment.*|coursework.*|deadlines?|exam(ination)? (info|details|dates?).*|contact.*|welcome.*|introduction|break)$/i;

const NUMBERED = /^(?:q(?:uestion)?\s*\d+\s*[.:)\-–]?|task\s*\d+\s*[.:)\-–]?|exercise\s*\d+\s*[.:)\-–]?|\(?[a-h1-9ivx]{1,3}[.)])\s*/i;
const ASKS = /^(explain|describe|define|compare|contrast|discuss|list|state|identify|outline|give|name|what|why|how|when|where|which|who)\b/i;
const ANSWER = /^(answer|solution|ans|model answer)\s*[:\-–]\s*(.*)$/i;

// the question on this line, or null
function questionIn(raw) {
  const line = clean(raw).replace(NUMBERED, '').trim();
  if (line.length < 18 || line.length > 300) return null;
  if (line.endsWith('?') || (ASKS.test(line) && line.split(' ').length >= 4)) return capital(line);
  return null;
}

// lines that are on most slides are a footer (module name, lecturer, page
// number). numbers are ignored so "CS2210 Databases 4" and "... 5" match
const footerKey = (line) => line.replace(/\d+/g, '').replace(/\s+/g, ' ').trim();

function footerLines(slides) {
  const count = {};
  slides.forEach((s) => new Set(s.lines.map(footerKey)).forEach((l) => (count[l] = (count[l] || 0) + 1)));
  return new Set(Object.keys(count).filter((l) => slides.length >= 4 && count[l] >= slides.length * 0.5));
}

// returns { defs, lists, answers } for one file
function factsFrom(slides) {
  const facts = { defs: [], lists: [], answers: [] };
  const footer = footerLines(slides);

  slides.forEach((slide) => {
    const title = clean(slide.title || '').replace(/[.:]$/, '');
    const lines = slide.lines
      .filter((l) => !footer.has(footerKey(l)))
      .map(clean)
      .filter((l) => l.length > 2 && !/^\d+$/.test(l) && !/^(page|slide)\s*\d+/i.test(l));

    lines.forEach((line, i) => {
      // a definition
      const def = definitionIn(line);
      if (def && !facts.defs.some((d) => same(d.term, def.term))) facts.defs.push({ ...def, slide: slide.n });

      // a question that has an "Answer:" line under it
      const question = questionIn(line);
      const answer = question && ANSWER.exec(lines[i + 1] || '');
      if (answer && answer[2].length > 3) facts.answers.push({ text: question, answer: asOption(answer[2]), slide: slide.n });
    });

    // a slide title with its bullet points
    if (!title || SKIP_SLIDE.test(title) || slide.n === 1) return;
    // definitions are left out here, they get their own questions
    const points = lines.filter((l) => l.length >= 4 && l.length <= 220 && !questionIn(l) && !ANSWER.test(l) && !definitionIn(l));
    if (points.length >= 2 && points.length <= 9 && points.join(' ').split(' ').length >= 6) {
      facts.lists.push({ title, points: points.map(asOption), slide: slide.n });
    }
  });
  return facts;
}

// ---------- step 2: questions ----------

// up to `count` wrong options: first from this file, then from the other
// files of the module, then (only if still short) from the other modules
function wrongOptions(right, own, pool, rest = [], count = 3) {
  const used = [right];
  const pick = (list) => shuffle(list).forEach((x) => {
    if (used.length <= count && x && !used.some((u) => tooClose(u, x))) used.push(x);
  });
  pick(own);
  pick(pool);
  pick(rest);
  return used.slice(1);
}

// one question, or null when there are not 3 wrong options for it
function question(kind, text, right, wrong, slide) {
  if (wrong.length < 3) return null;
  const options = shuffle([right, ...wrong]);
  return { id: uid('q'), kind, text, options, answer: options.indexOf(right), slide, seen: 0, right: 0 };
}

// facts = this file, pool = facts of the other files of the same module,
// rest = facts of the other modules
function questionsFrom(facts, pool, rest) {
  const out = [];
  const meanings = facts.defs.map((d) => d.text);
  const terms = facts.defs.map((d) => capital(d.term));
  const allPoints = (list) => list.flatMap((l) => l.points);

  facts.defs.forEach((d) => {
    // what does the term mean?
    const ask = d.glossary ? `What does "${lower(d.term)}" mean?` : `What ${d.plural ? 'are' : 'is'} ${d.article}${lower(d.term)}?`;
    out.push(question('definition', ask, d.text, wrongOptions(d.text, meanings, pool.defs.map((x) => x.text), rest.defs.map((x) => x.text)), d.slide));
    // which term has this meaning?
    out.push(question('term', `Which term matches this description?\n"${d.text}"`, capital(d.term), wrongOptions(capital(d.term), terms, pool.defs.map((x) => capital(x.term)), rest.defs.map((x) => capital(x.term))), d.slide));
  });

  facts.lists.forEach((list) => {
    const others = allPoints(facts.lists.filter((l) => l !== list)).filter((p) => !list.points.some((x) => same(x, p)));
    const poolPoints = allPoints(pool.lists).filter((p) => !list.points.some((x) => same(x, p)));

    // which of these is on the slide? a title that is already a question
    // ("Why not always normalise?") is asked as it is
    const asks = /\?$/.test(list.title) || /^(what|why|how|when|where|which|who)\b/i.test(list.title);
    const right = shuffle(list.points)[0];
    const ask = asks ? `${list.title.replace(/\?$/, '')}?` : `Which of these belongs to "${list.title}"?`;
    out.push(question('point', ask, right, wrongOptions(right, others, poolPoints, allPoints(rest.lists)), list.slide));

    // which of these is not on the slide?
    if (list.points.length >= 3 && !asks) {
      const odd = wrongOptions('', others.filter((p) => !list.points.some((x) => tooClose(x, p))), poolPoints, [], 1)[0];
      if (odd) out.push(question('not', `Which of these is NOT part of "${list.title}"?`, odd, shuffle(list.points).slice(0, 3), list.slide));
    }
  });

  facts.answers.forEach((a) => {
    const own = [...facts.answers.map((x) => x.answer), ...meanings];
    out.push(question('practice', a.text, a.answer, wrongOptions(a.answer, own, [...pool.answers.map((x) => x.answer), ...pool.defs.map((x) => x.text)], rest.defs.map((x) => x.text)), a.slide));
  });

  // the same question twice is kept once
  const seen = new Set();
  return out.filter((q) => q && !seen.has(q.text.toLowerCase()) && seen.add(q.text.toLowerCase()));
}

// ---------- all files ----------

// options = { modules: my modules, mod: module code picked by the student
// ('' = work it out), material: 'lecture' | 'tutorial' | 'workshop' | '',
// ai: true when the ai backend is running,
// known: the study files uploaded before (their facts give wrong options
// for basic questions) }
// returns { questions, files } where files says what was made from each file
export async function makeQuiz(files, options = {}) {
  const modules = options.modules || [];
  const read = [];
  const written = new Map(); // file -> the questions the ai wrote for it

  // read every file, and let the ai write its questions
  for (const file of files) {
    const slides = await extractSlides(file);

    // which module is it for: the one the student picked, or a module
    // code or name found in the file name or on the first slides
    const start = [file.name, file.webkitRelativePath || '', ...slides.slice(0, 2).flatMap((s) => [s.title, ...s.lines])].join(' ').toLowerCase();
    const mod = modules.find((m) => m.code === options.mod)
      || modules.find((m) => m.code && start.includes(m.code.toLowerCase()))
      || modules.find((m) => m.name && start.includes(m.name.toLowerCase()));

    const info = {
      id: uid('sf'),
      name: file.name,
      material: options.material || materialOf(file.name),
      mod: mod?.code || '',
      modName: mod?.name || 'General',
      color: mod?.color || '#64748b',
      slides: slides.length,
      facts: factsFrom(slides),
      by: 'basic', // who wrote the questions: 'ai' or 'basic'
      at: Date.now(),
    };
    read.push(info);

    if (options.ai && slides.length) {
      try {
        const answer = await aiQuestions({ slides, module: mod ? `${mod.code} ${mod.name}` : '', material: info.material, file: file.name });
        written.set(info, answer.map((q) => ({ id: uid('q'), kind: 'ai', text: q.text, options: q.options, answer: q.answer, explain: q.explain || '', slide: q.slide, seen: 0, right: 0 })));
        info.by = 'ai';
      } catch (err) {
        console.warn('ai questions failed for', file.name, err);
        info.error = err.message || 'The AI backend could not be reached.'; // basic questions are used instead
      }
    }
  }

  // basic questions: wrong options come from the other files of the same
  // module, the ones in this upload and the ones uploaded before
  const everything = [...read, ...(options.known || [])];
  const questions = [];
  read.forEach((file) => {
    const pool = { defs: [], lists: [], answers: [] };
    const rest = { defs: [], lists: [], answers: [] };
    everything.filter((f) => f !== file && f.facts).forEach((f) => {
      const group = f.mod === file.mod ? pool : rest;
      group.defs.push(...f.facts.defs);
      group.lists.push(...f.facts.lists);
      group.answers.push(...f.facts.answers);
    });

    const made = (written.get(file) || questionsFrom(file.facts, pool, rest)).slice(0, MAX_PER_FILE).map((q) => ({
      ...q,
      mod: file.mod,
      modName: file.modName,
      color: file.color,
      fileId: file.id,
      source: `${file.name} · ${/\.(pptx|pdf)$/i.test(file.name) ? 'slide' : 'part'} ${q.slide}`,
    }));
    file.questions = made.length;
    questions.push(...made);
  });

  return { questions, files: read };
}

const keyOf = (q) => `${q.mod || ''}|${q.text.toLowerCase()}`;

// adds new questions to the saved ones. a question that is already there
// is skipped, so uploading a file twice does not make copies
export function mergeQuestions(saved, fresh) {
  const have = new Set(saved.map(keyOf));
  return [...saved, ...fresh.filter((q) => !have.has(keyOf(q)) && have.add(keyOf(q)))];
}

// ---------- taking a quiz ----------

// picks the questions for a quiz: ones never answered come first, then the
// ones the student gets wrong most often
export function pickQuestions(bank, count) {
  const score = (q) => (q.seen ? 1 + q.right / q.seen : 0);
  return shuffle(shuffle(bank).sort((a, b) => score(a) - score(b)).slice(0, count));
}

// numbers for the study page and the semester report.
// results = finished quizzes: [{ items: [{ mod, modName, color, answer, picked }] }]
export function quizStats(results) {
  const items = results.flatMap((r) => r.items);
  const correct = items.filter((i) => i.picked === i.answer).length;
  const modules = new Map();
  items.forEach((i) => {
    const key = i.mod || i.modName;
    if (!modules.has(key)) modules.set(key, { code: i.mod, name: i.modName, color: i.color, answered: 0, correct: 0 });
    const m = modules.get(key);
    m.answered += 1;
    if (i.picked === i.answer) m.correct += 1;
  });
  const percent = (part, total) => (total ? Math.round((part / total) * 100) : 0);
  return {
    taken: results.length,
    answered: items.length,
    correct,
    pct: percent(correct, items.length),
    best: Math.max(0, ...results.map((r) => percent(r.correct, r.total))),
    modules: [...modules.values()].map((m) => ({ ...m, pct: percent(m.correct, m.answered) })),
  };
}
