// study page: the student uploads lecture slides, tutorial sheets and
// workshop sheets here, and multiple choice questions are written from
// them by ai (see services/quiz.js, services/ai.js and backend/main.py). in a quiz every answer is checked straight away,
// and at the end the whole result is shown. finished quizzes are saved and
// also go into the semester feedback report
import React, { useEffect, useState } from 'react';
import Icon from '../common/Icon';
import { Empty, Modal, toast } from '../common/ui';
import { useDB, update, logPersonal } from '../../store/db';
import { api } from '../../services/api';
import { aiStatus } from '../../services/ai';
import { mergeQuestions, pickQuestions, quizStats, materialOf, shuffle, MATERIALS } from '../../services/quiz';
import { timeAgo, uid } from '../../lib/format';
import { percent } from '../../lib/progress';

const MATERIAL_COLORS = { lecture: ['#e0e7ff', '#4338ca'], tutorial: ['#fef3c7', '#b45309'], workshop: ['#d1fae5', '#047857'] };
const FILE_TYPES = '.pdf,.pptx,.docx,.txt,.md';
const LETTERS = ['A', 'B', 'C', 'D'];
const SIZES = [5, 10, 20];
const GREEN = '#059669';
const RED = '#dc2626';
const NONE = [];

// colour for a score: green from 75%, amber from 50%, red under that
const scoreColor = (pct) => (pct >= 75 ? GREEN : pct >= 50 ? '#d97706' : RED);

// how a student is doing in a module: [label, background, text colour]
function standing(deck) {
  if (!deck.count) return ['No material yet', 'var(--soft3)', '#64748b'];
  if (!deck.answered) return ['No quiz taken', '#e0e7ff', '#4338ca'];
  if (deck.pct >= 75) return ['Strong', '#d1fae5', '#047857'];
  if (deck.pct >= 50) return ['Getting there', '#fef3c7', '#b45309'];
  return ['Needs work', '#fee2e2', '#b91c1c'];
}

export default function StudyView({ me }) {
  const bank = useDB((d) => d.questions?.[me]) || NONE;
  const results = useDB((d) => d.quizResults?.[me]) || NONE;
  const material = useDB((d) => d.studyFiles?.[me]) || NONE;
  const modules = useDB((d) => d.modules[me]) || NONE;
  const [filter, setFilter] = useState('all'); // 'all' or a module code
  const [size, setSize] = useState(10); // how many questions in a quiz
  const [quiz, setQuiz] = useState(null); // { items, at, picked, done } while a quiz is open
  const [popup, setPopup] = useState(null); // 'upload' while the upload popup is open
  const [openResult, setOpenResult] = useState(null); // a past quiz being looked at

  const inFilter = bank.filter((q) => filter === 'all' || q.mod === filter);

  // the quiz answers of one module (a quiz of "all modules" has questions
  // of many modules, so we look at every question, not at the whole quiz)
  const resultsOf = (code) => results
    .map((r) => {
      const items = r.items.filter((i) => i.mod === code);
      return { ...r, items, total: items.length, correct: items.filter((i) => i.picked === i.answer).length };
    })
    .filter((r) => r.total > 0);
  const stats = quizStats(filter === 'all' ? results : resultsOf(filter));

  // one deck for every module of the student, also the ones with no
  // material yet. questions that belong to no module are under "General"
  const known = new Set(modules.map((m) => m.code));
  const decks = [
    ...modules.map((m) => ({ code: m.code, name: m.name, color: m.color })),
    ...new Map(bank.filter((q) => !known.has(q.mod)).map((q) => [q.mod, { code: q.mod, name: q.modName, color: q.color }])).values(),
  ].map((deck) => {
    const score = quizStats(resultsOf(deck.code));
    return {
      ...deck,
      count: bank.filter((q) => q.mod === deck.code).length,
      files: material.filter((f) => f.mod === deck.code).length,
      answered: score.answered,
      correct: score.correct,
      pct: score.pct,
    };
  });
  const deckName = filter === 'all' ? 'All modules' : decks.find((x) => x.code === filter)?.name || filter;
  const label = (deck) => (deck.code ? `${deck.code} · ${deck.name}` : deck.name);

  // the module with the lowest quiz score (it needs 5 answers to count)
  const lagging = decks.filter((x) => x.answered >= 5 && x.pct < 75).sort((x, y) => x.pct - y.pct)[0];
  const untouched = decks.filter((x) => x.code && !x.count);

  const pickModule = (code) => {
    setFilter(code);
    setQuiz(null);
    setOpenResult(null);
  };

  const tiles = [
    ['Questions', inFilter.length, 'notes'],
    ['Quizzes taken', stats.taken, 'checkSquare'],
    ['Average score', stats.taken ? `${stats.pct}%` : 'n/a', 'pie'],
    ['Best score', stats.taken ? `${stats.best}%` : 'n/a', 'flag'],
  ];

  // ---------- quiz ----------

  // the options are mixed again every time, so the right one moves around
  function start(questions) {
    const items = questions.map((q) => {
      const options = shuffle(q.options);
      return { id: q.id, text: q.text, options, answer: options.indexOf(q.options[q.answer]), picked: null, mod: q.mod, modName: q.modName, color: q.color, source: q.source, explain: q.explain || '' };
    });
    setQuiz({ items, at: 0, done: false });
    setOpenResult(null);
  }

  // choosing an option locks the question and shows if it was right
  function pick(index) {
    const item = quiz.items[quiz.at];
    if (item.picked !== null) return;
    setQuiz({ ...quiz, items: quiz.items.map((x, i) => (i === quiz.at ? { ...x, picked: index } : x)) });
    update((db) => {
      const q = (db.questions?.[me] || []).find((x) => x.id === item.id);
      if (!q) return;
      q.seen = (q.seen || 0) + 1;
      if (index === item.answer) q.right = (q.right || 0) + 1;
    });
  }

  // saves the quiz (only the questions that were answered) and shows the result
  function finish() {
    const items = quiz.items.filter((x) => x.picked !== null);
    if (!items.length) return setQuiz(null);
    const correct = items.filter((x) => x.picked === x.answer).length;
    const result = { id: uid('z'), at: Date.now(), mod: filter, modName: deckName, total: items.length, correct, items };
    update((db) => {
      db.quizResults = db.quizResults || {};
      db.quizResults[me] = [result, ...(db.quizResults[me] || [])].slice(0, 100);
      logPersonal(db, me, `scored **${correct}/${items.length}** in a ${deckName} study quiz`);
    });
    setQuiz({ ...quiz, items, done: true });
  }

  const next = () => (quiz.at + 1 < quiz.items.length ? setQuiz({ ...quiz, at: quiz.at + 1 }) : finish());

  // keys 1 to 4 (or a to d) pick an option, enter goes to the next question
  useEffect(() => {
    if (!quiz || quiz.done || popup) return undefined;
    const onKey = (e) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      const item = quiz.items[quiz.at];
      const index = '1234'.indexOf(e.key) >= 0 ? '1234'.indexOf(e.key) : 'abcd'.indexOf(e.key.toLowerCase());
      if (item.picked === null && index >= 0 && e.key.length === 1) pick(index);
      else if (item.picked !== null && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---------- question bank ----------

  // removes an uploaded file and the questions that were made from it
  function removeFile(file) {
    if (!confirm(`Remove ${file.name} and the ${file.questions} questions made from it?`)) return;
    update((db) => {
      db.studyFiles[me] = db.studyFiles[me].filter((f) => f.id !== file.id);
      db.questions[me] = (db.questions[me] || []).filter((q) => q.fileId !== file.id);
      logPersonal(db, me, `removed study material **${file.name}**`);
    });
  }

  // puts an uploaded file, its questions and its old quiz answers under
  // another module (for a file that ended up in "General")
  function moveFile(file, code) {
    const mod = modules.find((m) => m.code === code);
    const to = { mod: mod?.code || '', modName: mod?.name || 'General', color: mod?.color || '#64748b' };
    update((db) => {
      Object.assign(db.studyFiles[me].find((f) => f.id === file.id), to);
      const moved = new Set();
      (db.questions[me] || []).filter((q) => q.fileId === file.id).forEach((q) => {
        Object.assign(q, to);
        moved.add(q.id);
      });
      (db.quizResults?.[me] || []).forEach((r) => r.items.filter((i) => moved.has(i.id)).forEach((i) => Object.assign(i, to)));
      logPersonal(db, me, `moved study material **${file.name}** to ${to.modName}`);
    });
  }

  const shownFiles = material.filter((f) => filter === 'all' || f.mod === filter);
  const current = quiz && !quiz.done && quiz.items[quiz.at];
  const shownResult = quiz?.done ? { items: quiz.items, correct: quiz.items.filter((x) => x.picked === x.answer).length, total: quiz.items.length, fresh: true } : openResult;

  return (
    <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-7">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Study Quiz</h1>
          <p className="text-[14px] mt-1 muted">Multiple choice questions made from your lecture slides, tutorials and workshops · {bank.length} questions</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setPopup('upload')} className="btn px-4 py-2.5 rounded-xl grad text-white text-[13px] font-bold inline-flex items-center gap-2">
            <Icon name="upload" size={16} /> Upload study material
          </button>
        </div>
      </div>

      <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            {tiles.map(([label, value, icon]) => (
              <div key={label} className="card p-4 flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl grid place-items-center text-indigo-600 shrink-0" style={{ background: 'var(--tint)' }}><Icon name={icon} size={18} /></span>
                <div>
                  <div className="text-[22px] font-extrabold leading-none">{value}</div>
                  <div className="text-[12px] font-semibold muted mt-1">{label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* module filter: every module of the student */}
          <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
            <button onClick={() => pickModule('all')} className={`btn shrink-0 px-3.5 py-2 rounded-xl text-[12.5px] font-bold border ${filter === 'all' ? 'grad text-white border-transparent' : 'bg-white line'}`}>All modules</button>
            {decks.map((deck) => {
              const on = filter === deck.code;
              return (
                <button key={deck.code} onClick={() => pickModule(deck.code)} style={on ? { background: deck.color } : {}}
                  className={`btn shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-xl text-[12.5px] font-bold border ${on ? 'text-white border-transparent' : 'bg-white line'}`}>
                  <span className="w-2 h-2 rounded-full" style={{ background: on ? '#fff' : deck.color }} />
                  {label(deck)}
                  <span className="opacity-70">{deck.count}</span>
                </button>
              );
            })}
          </div>

          {/* how the student is doing in every module */}
          {filter === 'all' && !quiz && !openResult && decks.length > 0 && (
            <section className="card p-5 mb-5">
              <h2 className="font-bold text-[15px]">Your modules</h2>
              <p className="text-[12.5px] muted mt-0.5 mb-3">
                {lagging
                  ? <>You are furthest behind in <b style={{ color: RED }}>{label(lagging)}</b> with {lagging.pct}% correct. Go over its slides and take its quiz again.</>
                  : untouched.length
                    ? `Upload slides for ${untouched.length === 1 ? label(untouched[0]) : `the ${untouched.length} modules with no material`} to start tracking ${untouched.length === 1 ? 'it' : 'them'}.`
                    : 'Take a quiz in each module to see where you are strong and where you are behind.'}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px] min-w-[720px]">
                  <thead>
                    <tr className="text-left text-[11px] font-bold muted">
                      <th className="py-2 pr-3 font-bold">MODULE</th>
                      <th className="py-2 px-2 font-bold text-right">FILES</th>
                      <th className="py-2 px-2 font-bold text-right">QUESTIONS</th>
                      <th className="py-2 px-2 font-bold text-right">ANSWERED</th>
                      <th className="py-2 px-3 font-bold w-[24%]">QUIZ SCORE</th>
                      <th className="py-2 px-2 font-bold">STATUS</th>
                      <th className="py-2 pl-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {decks.map((deck) => {
                      const [text, bg, fg] = standing(deck);
                      return (
                        <tr key={deck.code} className="border-t line">
                          <td className="py-2.5 pr-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: deck.color }} />
                              <span className="font-semibold truncate">{label(deck)}</span>
                              {lagging === deck && <span className="badge" style={{ background: '#fee2e2', color: '#b91c1c' }}>Lowest score</span>}
                            </div>
                          </td>
                          <td className="py-2.5 px-2 text-right tabular-nums">{deck.files}</td>
                          <td className="py-2.5 px-2 text-right tabular-nums">{deck.count}</td>
                          <td className="py-2.5 px-2 text-right tabular-nums">{deck.answered ? `${deck.correct}/${deck.answered}` : 0}</td>
                          <td className="py-2.5 px-3">
                            {deck.answered ? (
                              <div className="flex items-center gap-2.5">
                                <div className="h-2 rounded-full flex-1" style={{ background: 'var(--track)' }}>
                                  <div className="h-2 rounded-full" style={{ width: `${deck.pct}%`, background: scoreColor(deck.pct) }} />
                                </div>
                                <span className="font-bold tabular-nums w-10 text-right">{deck.pct}%</span>
                              </div>
                            ) : <span className="text-[12px] muted">Not tested yet</span>}
                          </td>
                          <td className="py-2.5 px-2"><span className="badge" style={{ background: bg, color: fg }}>{text}</span></td>
                          <td className="py-2.5 pl-2 text-right">
                            <button onClick={() => { pickModule(deck.code); if (!deck.count) setPopup('upload'); }} className="btn text-[12.5px] font-bold text-indigo-600 whitespace-nowrap">
                              {deck.count ? 'Open' : 'Upload slides'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <div className="grid xl:grid-cols-[minmax(0,1fr)_420px] gap-5 items-start">
            <section className="card p-5 sm:p-7 min-h-[440px] flex flex-col">
              {/* start screen */}
              {!quiz && !shownResult && !inFilter.length && (
                <div className="m-auto text-center max-w-md">
                  <div className="w-14 h-14 rounded-2xl mx-auto mb-3 grid place-items-center text-indigo-600" style={{ background: 'var(--tint)' }}><Icon name="cards" size={26} /></div>
                  <h2 className="text-xl font-extrabold">No questions for {deckName} yet</h2>
                  <p className="text-[13px] muted mt-2">Upload {filter === 'all' ? 'your' : 'the'} lecture slides, tutorial sheets and workshop sheets{filter === 'all' ? '' : ' of this module'} (PowerPoint, PDF, Word or text). AI reads them and writes multiple choice questions about what they teach.</p>
                  <button onClick={() => setPopup('upload')} className="btn mt-5 px-5 py-3 rounded-xl grad text-white font-bold text-[13px] inline-flex items-center gap-2">
                    <Icon name="upload" size={16} /> Upload {filter === 'all' ? 'study material' : `for ${filter || 'General'}`}
                  </button>
                </div>
              )}

              {!quiz && !shownResult && inFilter.length > 0 && (
                <div className="m-auto text-center max-w-md">
                  <div className="text-[44px] font-extrabold leading-none grad-text">{inFilter.length}</div>
                  <div className="font-bold mt-2">{inFilter.length === 1 ? 'question' : 'questions'} in {deckName}</div>
                  <p className="text-[13px] muted mt-2">Every answer is checked straight away. At the end you see your score and all the right answers. Questions you have not seen, or got wrong before, come first.</p>
                  <div className="lbl mt-5 mb-2">QUESTIONS IN THE QUIZ</div>
                  <div className="inline-flex p-1 rounded-xl" style={{ background: 'var(--soft2)' }}>
                    {[...SIZES.filter((n) => n < inFilter.length), inFilter.length].map((n) => (
                      <button key={n} onClick={() => setSize(n)}
                        className={`btn px-3.5 py-1.5 rounded-lg text-[13px] font-bold ${Math.min(size, inFilter.length) === n ? 'bg-white shadow text-indigo-700' : 'text-slate-500'}`}>
                        {n === inFilter.length ? `All ${n}` : n}
                      </button>
                    ))}
                  </div>
                  <div><button onClick={() => start(pickQuestions(inFilter, size))} disabled={!inFilter.length} className="btn mt-5 px-6 py-3 rounded-xl grad text-white text-[14px] font-bold disabled:opacity-50">Start quiz</button></div>
                </div>
              )}

              {/* one question */}
              {current && (
                <>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="badge" style={{ background: current.color + '1a', color: current.color }}>{current.mod || current.modName}</span>
                    <span className="text-[12.5px] font-bold">Question {quiz.at + 1} of {quiz.items.length}</span>
                    <button onClick={finish} className="btn ml-auto text-[12px] font-bold text-indigo-600">End quiz</button>
                  </div>
                  <div className="h-1.5 rounded-full mb-6" style={{ background: 'var(--track)' }}>
                    <div className="h-1.5 rounded-full grad" style={{ width: `${percent(quiz.at + (current.picked !== null ? 1 : 0), quiz.items.length)}%`, transition: 'width .25s' }} />
                  </div>

                  <div key={current.id} className="fade flex-1">
                    <h2 className="text-lg sm:text-xl font-extrabold tracking-tight leading-snug whitespace-pre-wrap">{current.text}</h2>
                    <div className="space-y-2.5 mt-5">
                      {current.options.map((option, i) => <Option key={i} letter={LETTERS[i]} text={option} item={current} index={i} onPick={() => pick(i)} />)}
                    </div>

                    {current.picked !== null && (
                      <div className="pop mt-4 p-3.5 rounded-xl flex items-start gap-3" style={{ background: current.picked === current.answer ? 'var(--tint-green)' : 'var(--tint-rose)' }}>
                        <Icon name={current.picked === current.answer ? 'checkCircle' : 'alert'} size={18} className="mt-0.5" />
                        <div className="text-[13px] leading-snug flex-1" style={{ color: current.picked === current.answer ? GREEN : RED }}>
                          <b>{current.picked === current.answer ? 'Correct.' : `Not correct. The answer is ${LETTERS[current.answer]}.`}</b>
                          {current.explain && <div className="mt-1" style={{ color: 'var(--ink)' }}>{current.explain}</div>}
                          {current.source && <div className="muted mt-0.5">From {current.source}</div>}
                        </div>
                      </div>
                    )}
                  </div>

                  <button onClick={next} disabled={current.picked === null} className="btn mt-5 w-full py-3.5 rounded-xl grad text-white text-[14px] font-bold disabled:opacity-40">
                    {current.picked === null ? 'Choose an answer' : quiz.at + 1 < quiz.items.length ? 'Next question' : 'See result'}
                  </button>
                </>
              )}

              {/* result of the quiz just finished, or of an old one */}
              {shownResult && <Result result={shownResult} onClose={() => { setQuiz(null); setOpenResult(null); }}
                onRetryWrong={() => start(bank.filter((q) => shownResult.items.some((x) => x.id === q.id && x.picked !== x.answer)))}
                onAgain={() => start(pickQuestions(inFilter, size))} bank={bank} />}
            </section>

            <div className="space-y-5">
              {/* finished quizzes */}
              <aside className="card p-4">
                <div className="flex items-center gap-2 mb-3 px-1">
                  <h2 className="font-bold text-[15px]">Past quizzes</h2>
                  <span className="badge" style={{ background: 'var(--soft2)', color: '#64748b' }}>{results.length}</span>
                </div>
                {!results.length && <Empty>No quiz taken yet.</Empty>}
                <div className="space-y-1.5 max-h-[230px] overflow-y-auto pr-1">
                  {results.map((r) => {
                    const pct = percent(r.correct, r.total);
                    return (
                      <button key={r.id} onClick={() => { setQuiz(null); setOpenResult(r); }} className="w-full text-left flex items-center gap-3 p-2.5 rounded-xl border line hover:bg-slate-50">
                        <span className="w-11 h-11 rounded-xl grid place-items-center text-[13px] font-extrabold text-white shrink-0" style={{ background: scoreColor(pct) }}>{pct}%</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-semibold truncate">{r.modName}</div>
                          <div className="text-[11.5px] muted">{r.correct} of {r.total} correct · {timeAgo(r.at)}</div>
                        </div>
                        <Icon name="arrowRight" size={14} className="text-slate-400" />
                      </button>
                    );
                  })}
                </div>
              </aside>

              {/* the files the questions were made from */}
              <aside className="card p-4">
                <div className="flex items-center gap-2 mb-3 px-1">
                  <h2 className="font-bold text-[15px]">Study material</h2>
                  <span className="badge" style={{ background: 'var(--soft2)', color: '#64748b' }}>{shownFiles.length}</span>
                  <button onClick={() => setPopup('upload')} className="btn ml-auto text-[12px] font-bold text-indigo-600">Upload more</button>
                </div>
                {!shownFiles.length && <Empty>{filter === 'all' ? 'No files uploaded yet.' : `No files for ${deckName} yet.`}</Empty>}
                <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                  {shownFiles.map((f) => {
                    const [bg, fg] = MATERIAL_COLORS[f.material] || MATERIAL_COLORS.lecture;
                    return (
                      <div key={f.id} className="flex items-center gap-2.5 p-2.5 rounded-xl border line">
                        <span className="w-8 h-8 rounded-lg grid place-items-center shrink-0" style={{ background: 'var(--soft3)' }}><Icon name="file" size={15} className="text-slate-500" /></span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-semibold truncate" title={f.name}>{f.name}</div>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1">
                            <span className="badge" style={{ background: bg, color: fg }}>{MATERIALS[f.material]}</span>
                            {f.by === 'ai' && <span className="badge" style={{ background: '#ede9fe', color: '#6d28d9' }}>AI questions</span>}
                            <span className="text-[11.5px] muted">{f.questions} {f.questions === 1 ? 'question' : 'questions'}</span>
                          </div>
                          <select value={f.mod} onChange={(e) => moveFile(f, e.target.value)} title="Module this file belongs to" aria-label="Module this file belongs to"
                            className="mt-1.5 max-w-full px-2 py-1 rounded-lg border line text-[11.5px] font-semibold outline-none" style={{ background: 'var(--field)', color: 'var(--ink)' }}>
                            {!known.has(f.mod) && <option value={f.mod}>{f.mod ? `${f.mod} · ${f.modName}` : 'General (no module)'}</option>}
                            {modules.map((m) => <option key={m.id} value={m.code}>{m.code} · {m.name}</option>)}
                          </select>
                        </div>
                        <button onClick={() => removeFile(f)} title="Remove file and its questions" aria-label="Remove file and its questions" className="btn text-slate-300 hover:text-rose-500 p-0.5"><Icon name="x" size={15} /></button>
                      </div>
                    );
                  })}
                </div>
              </aside>
            </div>
          </div>
      </>

      {popup === 'upload' && <UploadPopup me={me} modules={modules} known={material} defaultModule={known.has(filter) ? filter : ''} onClose={() => setPopup(null)} />}
    </main>
  );
}

// one answer option. before answering it is a plain button. after answering
// the right option turns green and a wrong pick turns red
function Option({ letter, text, item, index, onPick }) {
  const answered = item.picked !== null;
  const right = answered && index === item.answer;
  const wrong = answered && index === item.picked && !right;
  const color = right ? GREEN : wrong ? RED : null;
  return (
    <button onClick={onPick} disabled={answered}
      className={`w-full text-left flex items-center gap-3 p-3.5 rounded-xl border-2 text-[14px] ${answered ? '' : 'btn hover:bg-slate-50'}`}
      style={{ borderColor: color || 'var(--line)', background: right ? 'var(--tint-green)' : wrong ? 'var(--tint-rose)' : undefined, opacity: answered && !color ? 0.6 : 1 }}>
      <span className="w-7 h-7 rounded-lg grid place-items-center text-[12px] font-extrabold shrink-0" style={color ? { background: color, color: '#fff' } : { background: 'var(--soft2)' }}>{letter}</span>
      <span className="flex-1 leading-snug">{text}</span>
      {right && <span className="inline-flex items-center gap-1 text-[12px] font-bold whitespace-nowrap" style={{ color: GREEN }}><Icon name="check" size={15} /> Correct answer</span>}
      {wrong && <span className="inline-flex items-center gap-1 text-[12px] font-bold whitespace-nowrap" style={{ color: RED }}><Icon name="x" size={15} /> Your answer</span>}
    </button>
  );
}

// the whole result: the score and every question with my answer and the right one
function Result({ result, bank, onClose, onRetryWrong, onAgain }) {
  const pct = percent(result.correct, result.total);
  const wrong = result.items.filter((x) => x.picked !== x.answer);
  const canRetry = wrong.some((x) => bank.some((q) => q.id === x.id));
  const message = pct >= 75 ? 'Well done. You know this material.' : pct >= 50 ? 'Not bad. Go over the ones you missed.' : 'Read the slides again, then retry the ones you missed.';

  return (
    <div className="fade">
      <div className="flex flex-wrap items-center gap-5">
        <div className="w-24 h-24 rounded-full grid place-items-center shrink-0" style={{ border: `6px solid ${scoreColor(pct)}` }}>
          <div className="text-center leading-none">
            <div className="text-[24px] font-extrabold">{pct}%</div>
            <div className="text-[11px] font-semibold muted mt-1">{result.correct} of {result.total}</div>
          </div>
        </div>
        <div className="flex-1 min-w-[200px]">
          <div className="text-[11px] font-bold muted">{result.fresh ? 'QUIZ FINISHED' : `QUIZ RESULT · ${result.modName.toUpperCase()}`}</div>
          <h2 className="text-xl font-extrabold tracking-tight mt-1">{result.correct} correct, {result.total - result.correct} wrong</h2>
          <p className="text-[13px] muted mt-1">{message}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canRetry && <button onClick={onRetryWrong} className="btn px-4 py-2.5 rounded-xl border line text-[13px] font-bold">Retry wrong ones ({wrong.length})</button>}
          <button onClick={onAgain} className="btn px-4 py-2.5 rounded-xl border line text-[13px] font-bold">New quiz</button>
          <button onClick={onClose} className="btn px-4 py-2.5 rounded-xl grad text-white text-[13px] font-bold">Done</button>
        </div>
      </div>

      <div className="lbl mt-6 mb-2">ALL QUESTIONS</div>
      <div className="space-y-2.5">
        {result.items.map((item, n) => {
          const ok = item.picked === item.answer;
          return (
            <div key={item.id + n} className="p-3.5 rounded-xl border line">
              <div className="flex items-start gap-2.5">
                <span className="w-6 h-6 rounded-full grid place-items-center text-white shrink-0 mt-0.5" style={{ background: ok ? GREEN : RED }}><Icon name={ok ? 'check' : 'x'} size={13} /></span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-semibold leading-snug whitespace-pre-wrap">{n + 1}. {item.text}</div>
                  {!ok && <div className="text-[13px] mt-1.5" style={{ color: RED }}>Your answer: {LETTERS[item.picked]}. {item.options[item.picked]}</div>}
                  <div className="text-[13px] mt-1" style={{ color: GREEN }}>Correct answer: {LETTERS[item.answer]}. {item.options[item.answer]}</div>
                  {item.explain && <div className="text-[12.5px] mt-1.5">{item.explain}</div>}
                  {item.source && <div className="text-[11.5px] muted mt-1">From {item.source}</div>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// popup to upload lecture slides, tutorial sheets and workshop sheets.
// the files are read in the browser and turned into questions
function UploadPopup({ me, modules, known, defaultModule, onClose }) {
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ai, setAi] = useState(null); // null while checking, then { on, model, why }

  // is the ai backend running?
  useEffect(() => {
    let open = true;
    aiStatus().then((status) => open && setAi(status));
    return () => { open = false; };
  }, []);

  async function submit(e) {
    e.preventDefault();
    if (!files.length) return setError('Choose at least 1 file.');
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    try {
      const result = await api.quiz(files, { modules, mod: form.get('mod'), material: form.get('material'), ai: !!ai?.on, known });
      let added = 0;
      update((db) => {
        db.questions = db.questions || {};
        db.studyFiles = db.studyFiles || {};
        const before = db.questions[me] || [];
        db.questions[me] = mergeQuestions(before, result.questions);
        added = db.questions[me].length - before.length;
        // remember each file with the number of questions that were really added
        const kept = result.files.map((f) => ({ ...f, questions: db.questions[me].filter((q) => q.fileId === f.id).length }));
        db.studyFiles[me] = [...kept.filter((f) => f.questions > 0), ...(db.studyFiles[me] || [])];
        if (added) logPersonal(db, me, `made **${added} quiz questions** from ${files.length === 1 ? files[0].name : `${files.length} files`}`);
      });

      const empty = result.files.filter((f) => !f.slides).map((f) => f.name);
      if (empty.length) toast({ icon: 'alert', title: 'Could not read text', text: `${empty.join(', ')} has no text we can read (scanned or image slides).`, ms: 8000 });
      // the ai was on but could not write the questions of a file
      const failed = result.files.filter((f) => f.error);
      if (failed.length) toast({ icon: 'alert', title: 'AI could not write some questions', text: `${failed[0].error} Basic questions were made for ${failed.map((f) => f.name).join(', ')}.`, ms: 12000 });
      const byAi = result.files.some((f) => f.by === 'ai');
      toast({
        icon: 'notes',
        ms: 7000,
        title: added ? `${added} new questions${byAi ? ' written by AI' : ''}` : 'No new questions',
        text: added ? 'Press Start quiz to begin.' : 'No questions could be made from these files. They may have too little text.',
      });
      onClose();
    } catch (err) {
      console.error(err);
      setError(err.message || 'Could not read these files.');
      setBusy(false);
    }
  }

  return (
    <Modal title="Upload study material" sub="Lecture slides, tutorial sheets and workshop sheets only. Questions are written from what the slides teach." onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <label className="drop block rounded-xl p-5 text-center cursor-pointer">
          <Icon name="upload" size={22} className="mx-auto text-indigo-600" />
          <div className="text-[13.5px] font-bold mt-2">{files.length ? `${files.length} ${files.length === 1 ? 'file' : 'files'} chosen` : 'Choose files'}</div>
          <div className="text-[12px] muted mt-0.5">PowerPoint (.pptx), PDF, Word (.docx) or text</div>
          <input type="file" multiple accept={FILE_TYPES} className="hidden" onChange={(e) => { setFiles([...e.target.files]); setError(''); }} />
        </label>

        {files.length > 0 && (
          <div className="space-y-1.5 max-h-[150px] overflow-y-auto">
            {files.map((f) => (
              <div key={f.name + f.size} className="flex items-center gap-2 text-[12.5px]">
                <Icon name="file" size={14} className="text-slate-400" />
                <span className="truncate flex-1 font-semibold">{f.name}</span>
                <span className="muted whitespace-nowrap">{MATERIALS[materialOf(f.name)]}</span>
              </div>
            ))}
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="lbl">MODULE</label>
            <select name="mod" defaultValue={defaultModule} className="field mt-1.5">
              <option value="">Work it out from the file</option>
              {modules.map((m) => <option key={m.id} value={m.code}>{m.code} · {m.name}</option>)}
            </select>
          </div>
          <div>
            <label className="lbl">KIND OF MATERIAL</label>
            <select name="material" defaultValue="" className="field mt-1.5">
              <option value="">Work it out from the file name</option>
              {Object.entries(MATERIALS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </div>
        </div>

        {/* says if the questions will be written by ai or not */}
        {ai && (
          <div className="p-3 rounded-xl text-[12.5px] leading-snug flex gap-2.5" style={{ background: ai.on ? 'var(--tint-green)' : 'var(--soft)' }}>
            <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: ai.on ? GREEN : '#d97706' }} />
            {ai.on
              ? <span><b>AI questions are on.</b> The text of the slides is sent to Google Gemini ({ai.model}), which writes the questions. This can take up to a minute for each file.</span>
              : <span><b>AI questions are off.</b> {ai.why} Only basic questions can be made, and they are much weaker. See backend/README.md to turn AI on.</span>}
          </div>
        )}

        {error && <div className="p-3 rounded-xl text-[12.5px] font-semibold" style={{ background: '#fee2e2', color: '#b91c1c' }}>{error}</div>}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn flex-1 py-3 rounded-xl border line font-bold text-[13px]">Cancel</button>
          <button disabled={busy || !ai} className="btn flex-1 py-3 rounded-xl grad text-white font-bold text-[13px] disabled:opacity-60">{busy ? (ai?.on ? 'AI is writing questions…' : 'Reading slides…') : 'Make questions'}</button>
        </div>
      </form>
    </Modal>
  );
}
