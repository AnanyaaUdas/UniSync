// the semester feedback report. it is sent as a notification when the
// semester has ended, opens over the page and can be downloaded as a pdf. `saved` is an older report from a closed semester,
// without it the report is made live from the boards
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Donut from '../common/Donut';
import Icon from '../common/Icon';
import { useDB, update } from '../../store/db';
import { buildReport, closeSemester } from '../../services/semesterReport';
import { STATUS_COLOR, percent } from '../../lib/progress';
import { SEMS } from '../../lib/constants';

const day = (time) => new Date(time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export default function SemesterReport({ me, saved, onClose }) {
  const d = useDB();
  const r = saved ? saved.report : buildReport(d, me);
  const ind = r.individual;
  const quiz = r.quiz || { taken: 0, modules: [] }; // reports saved before quizzes existed have none
  const hasData = ind.total > 0 || r.groups.length > 0 || quiz.taken > 0;
  const lastSemester = SEMS.indexOf(r.semester) === SEMS.length - 1;
  const sheet = useRef();
  const [making, setMaking] = useState(false);

  // takes a picture of the report and saves it as a pdf file
  async function downloadPdf() {
    setMaking(true);
    const root = document.documentElement;
    const theme = root.dataset.theme;
    try {
      root.dataset.theme = 'light'; // the pdf is always in light colours
      await new Promise((done) => setTimeout(done, 80));
      const [{ toCanvas }, { canvasToPdf }] = await Promise.all([import('html-to-image'), import('../../lib/pdf')]);
      const box = sheet.current;
      const scale = 2;
      const canvas = await toCanvas(box, {
        pixelRatio: scale,
        backgroundColor: '#ffffff',
        style: { animation: 'none', borderRadius: '0' },
        filter: (el) => !el.classList?.contains('no-print'),
      });
      // where the blocks end, so a page does not cut through one
      const top = box.getBoundingClientRect().top;
      const breaks = [...box.querySelectorAll('section, .report-block, h2, p')].map((el) => (el.getBoundingClientRect().bottom - top + 6) * (canvas.width / box.offsetWidth));
      const pdf = await canvasToPdf(canvas, breaks);

      const link = document.createElement('a');
      link.href = URL.createObjectURL(pdf);
      link.download = `UniSync report ${r.semester} ${r.student.name}.pdf`.replace(/\s+/g, '-');
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 5000);
    } catch (err) {
      console.error(err);
      alert('The PDF could not be made. Please try again.');
    } finally {
      root.dataset.theme = theme;
      setMaking(false);
    }
  }

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function close() {
    const text = lastSemester
      ? `Close ${r.semester}? The report is saved and completed tasks will not be counted again.`
      : `Close ${r.semester}? The report is saved, completed tasks will not be counted again and you move to the next semester.`;
    if (!confirm(text)) return;
    update((db) => closeSemester(db, me, buildReport(db, me)));
    onClose();
  }

  const tiles = [
    ['Individual tasks completed', `${ind.done}/${ind.total}`, `${ind.pct}%`],
    ['Finished on time', ind.timed ? `${ind.onTimePct}%` : 'n/a', ind.timed ? `${ind.onTime} of ${ind.timed}` : 'no dated tasks yet'],
    ['Group tasks completed by you', `${r.group.done}/${r.group.assigned}`, `${percent(r.group.done, r.group.assigned)}%`],
    ['Overdue now', ind.overdue + r.group.overdue, 'individual and group'],
    ['Study quiz average', quiz.taken ? `${quiz.pct}%` : 'n/a', quiz.taken ? `${quiz.taken} ${quiz.taken === 1 ? 'quiz' : 'quizzes'} taken` : 'no quiz taken'],
  ];

  return createPortal(
    <div className="report-overlay fixed inset-0 z-[70] bg-slate-900/45 flex items-start justify-center p-0 sm:p-6 overflow-y-auto"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={sheet} className="report-sheet pop w-full sm:max-w-[880px] sm:rounded-2xl p-5 sm:p-8" style={{ background: 'var(--panel)', color: 'var(--ink)' }}>
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-bold muted">UNISYNC · SEMESTER FEEDBACK REPORT</div>
            <h1 className="text-2xl font-extrabold tracking-tight mt-1">{r.semester}</h1>
            <p className="text-[13px] muted mt-1">
              {r.student.name} · {r.student.dept}{r.student.lmuId ? ` · London Met ID ${r.student.lmuId}` : ''}
            </p>
            <p className="text-[12px] muted mt-0.5">
              {saved ? `Closed on ${day(saved.closedAt)}` : `End of semester report, made on ${day(r.generatedAt)}.`}
            </p>
          </div>
          <div className="no-print flex items-center gap-2">
            <button onClick={downloadPdf} disabled={making} className="btn px-3 py-2 rounded-xl grad text-white text-[12.5px] font-bold inline-flex items-center gap-1.5 disabled:opacity-60">
              <Icon name="download" size={15} /> {making ? 'Making PDF…' : 'Download PDF'}
            </button>
            <button onClick={onClose} aria-label="Close" className="btn p-1 muted"><Icon name="x" size={20} /></button>
          </div>
        </div>

        {!hasData && (
          <div className="mt-6 text-center py-10 px-3 text-[13px] rounded-xl border border-dashed muted line">
            There is no work to report on yet. Upload your modules or add tasks, then come back.
          </div>
        )}

        {hasData && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-6">
              {tiles.map(([label, value, sub]) => (
                <div key={label} className="p-3.5 rounded-xl" style={{ background: 'var(--soft)' }}>
                  <div className="text-[11px] font-bold muted leading-tight">{label.toUpperCase()}</div>
                  <div className="text-[22px] font-extrabold mt-1.5 leading-none">{value}</div>
                  <div className="text-[11.5px] muted mt-1">{sub}</div>
                </div>
              ))}
            </div>

            {ind.total > 0 && (
              <section className="mt-7">
                <h2 className="font-bold text-[15px]">Individual work</h2>
                <div className="grid md:grid-cols-2 gap-6 mt-3 items-start">
                  <Donut data={ind.byStatus.map((s) => ({ ...s, color: STATUS_COLOR[s.key] }))} size={150} thickness={22}
                    centerValue={`${ind.pct}%`} centerLabel="completed" />
                  <div>
                    <div className="text-[11px] font-bold muted mb-2">COMPLETED BY MODULE</div>
                    {!ind.modules.length && <div className="text-[13px] muted">No module tasks yet.</div>}
                    <div className="space-y-3">
                      {ind.modules.map((m) => (
                        <div key={m.code + m.name}>
                          <div className="flex items-baseline gap-2 text-[13px]">
                            <span className="font-semibold truncate flex-1">{m.code} · {m.name}{m.yearLong ? ' (year long, continues)' : ''}</span>
                            <span className="font-bold tabular-nums">{m.done}/{m.total}</span>
                            <span className="muted tabular-nums w-10 text-right">{m.pct}%</span>
                          </div>
                          <div className="h-2 rounded-full mt-1.5" style={{ background: 'var(--track)' }}>
                            <div className="h-2 rounded-full" style={{ width: `${m.pct}%`, background: m.color }} />
                          </div>
                          {m.overdue > 0 && <div className="text-[11.5px] mt-1" style={{ color: '#dc2626' }}>{m.overdue} overdue</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {r.groups.length > 0 && (
              <section className="mt-7">
                <h2 className="font-bold text-[15px]">Group work</h2>
                <p className="text-[12.5px] muted mt-0.5">Share of the completed tasks in each group. A task counts for the member it is assigned to.</p>
                <div className="space-y-4 mt-3">
                  {r.groups.map((g) => (
                    <div key={g.id} className="report-block p-4 rounded-xl border line">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-3">
                        <h3 className="font-bold text-[14px] flex-1 min-w-[200px]">{g.name}</h3>
                        <span className="text-[12.5px] muted">{g.done} of {g.total} tasks completed ({g.pct}%) · {g.meetings} {g.meetings === 1 ? 'meeting' : 'meetings'} with minutes</span>
                      </div>
                      <Donut size={132} thickness={20} centerValue={g.done} centerLabel="completed" emptyText="Nothing completed yet"
                        data={g.members.map((m) => ({ key: m.id, label: m.id === me ? `${m.name} (you)` : m.name, value: m.done, color: m.color }))} />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {quiz.taken > 0 && (
              <section className="mt-7">
                <h2 className="font-bold text-[15px]">Study quizzes</h2>
                <p className="text-[12.5px] muted mt-0.5">
                  {quiz.correct} of {quiz.answered} questions correct in {quiz.taken} {quiz.taken === 1 ? 'quiz' : 'quizzes'} · average {quiz.pct}% · best quiz {quiz.best}%
                </p>
                <div className="grid md:grid-cols-2 gap-x-6 gap-y-3 mt-3">
                  {quiz.modules.map((m) => (
                    <div key={m.code + m.name} className="report-block">
                      <div className="flex items-baseline gap-2 text-[13px]">
                        <span className="font-semibold truncate flex-1">{m.code ? `${m.code} · ${m.name}` : m.name}</span>
                        <span className="font-bold tabular-nums">{m.correct}/{m.answered}</span>
                        <span className="muted tabular-nums w-10 text-right">{m.pct}%</span>
                      </div>
                      <div className="h-2 rounded-full mt-1.5" style={{ background: 'var(--track)' }}>
                        <div className="h-2 rounded-full" style={{ width: `${m.pct}%`, background: m.color }} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="mt-7 grid md:grid-cols-3 gap-4">
              <FeedbackList title="What went well" items={r.feedback.strengths} empty="Complete more tasks to see your strengths here." />
              <FeedbackList title="What to improve" items={r.feedback.improve} empty="Nothing stands out. Good work." />
              <FeedbackList title="Next semester" items={r.feedback.next} />
            </section>

            <p className="text-[11.5px] muted mt-6">
              This report is made from your UniSync data only: tasks, deadlines, group activity, saved meeting minutes and study quiz scores. It is not a grade and does not include marks from the college.
            </p>
          </>
        )}

        {!saved && hasData && (
          <div className="no-print mt-6 pt-5 border-t line flex flex-wrap items-center gap-3">
            <p className="text-[12.5px] muted flex-1 min-w-[220px]">
              When the semester is over, close it to save this report{lastSemester ? '.' : ' and move to the next semester.'} Tasks that are not finished carry over.
            </p>
            <button onClick={close} className="btn px-4 py-2.5 rounded-xl grad text-white text-[13px] font-bold">Close semester and save report</button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function FeedbackList({ title, items, empty }) {
  return (
    <div className="report-block p-4 rounded-xl" style={{ background: 'var(--soft)' }}>
      <h3 className="font-bold text-[13.5px] mb-2">{title}</h3>
      {!items.length && <p className="text-[12.5px] muted">{empty}</p>}
      <ul className="space-y-2 list-disc pl-4">
        {items.map((text, i) => <li key={i} className="text-[12.5px] leading-snug">{text}</li>)}
      </ul>
    </div>
  );
}
