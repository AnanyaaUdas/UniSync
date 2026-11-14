// builds the feedback report a student gets at the end of a semester.
// it only uses what is already in the app: individual tasks, group tasks,
// deadlines and exams. the feedback sentences are made with simple
// rules for now. later the python backend can write them with an ai model
// (POST /api/ai/semester-feedback).
import { userById, displayName, logPersonal } from '../store/db';
import { SEMS, COLS } from '../lib/constants';
import { uid } from '../lib/format';
import { percent, finishedOnTime, isOverdue } from '../lib/progress';

// tasks that were already counted in an older report are skipped
const closedIds = (d, me) => new Set(d.reportClosed?.[me] || []);

export function buildReport(d, me) {
  const user = userById(d, me);
  const closed = closedIds(d, me);

  // ---------- individual work ----------
  const solo = (d.solo[me] || []).filter((t) => !closed.has(t.id));
  const soloDone = solo.filter((t) => t.status === 'done');
  const timed = soloDone.map(finishedOnTime).filter((x) => x !== null);
  const onTime = timed.filter(Boolean).length;

  const modules = (d.modules[me] || [])
    .map((m) => {
      const tasks = solo.filter((t) => t.mod === m.id);
      const done = tasks.filter((t) => t.status === 'done').length;
      return { code: m.code, name: m.name, color: m.color, yearLong: m.duration === 'year' && !m.continued, total: tasks.length, done, pct: percent(done, tasks.length), overdue: tasks.filter((t) => isOverdue(t, t.status)).length };
    })
    .filter((m) => m.total > 0);

  const individual = {
    total: solo.length,
    done: soloDone.length,
    pct: percent(soloDone.length, solo.length),
    byStatus: COLS.map((col) => ({ key: col.id, label: col.name, value: solo.filter((t) => t.status === col.id).length })),
    timed: timed.length,
    onTime,
    late: timed.length - onTime,
    onTimePct: percent(onTime, timed.length),
    overdue: solo.filter((t) => isOverdue(t, t.status)).length,
    modules,
  };

  // ---------- group work ----------
  const groups = d.projects
    .filter((p) => p.members.includes(me))
    .map((p) => {
      const tasks = p.tasks.filter((t) => !closed.has(t.id));
      const done = tasks.filter((t) => t.col === 'done');
      const members = p.members.map((id) => ({
        id,
        name: displayName(userById(d, id)),
        color: userById(d, id).color,
        assigned: tasks.filter((t) => t.assignee === id).length,
        done: done.filter((t) => t.assignee === id).length,
      }));
      const mine = members.find((m) => m.id === me);
      return {
        id: p.id,
        name: p.name,
        total: tasks.length,
        done: done.length,
        pct: percent(done.length, tasks.length),
        members,
        myAssigned: mine.assigned,
        myDone: mine.done,
        myShare: percent(mine.done, done.length), // my part of the finished work
        equalShare: Math.round(100 / p.members.length),
        myOverdue: tasks.filter((t) => t.assignee === me && isOverdue(t, t.col)).length,
        meetings: p.chat.filter((c) => c.type === 'meeting-notes').length,
      };
    })
    .filter((g) => g.total > 0);

  const group = {
    assigned: groups.reduce((n, g) => n + g.myAssigned, 0),
    done: groups.reduce((n, g) => n + g.myDone, 0),
    overdue: groups.reduce((n, g) => n + g.myOverdue, 0),
    meetings: groups.reduce((n, g) => n + g.meetings, 0),
  };

  const report = {
    semester: user.sem,
    student: { name: user.name, dept: user.dept, lmuId: user.lmuId || '', email: user.email },
    generatedAt: Date.now(),
    individual,
    groups,
    group,
    exams: (d.exams[me] || []).length,
  };
  report.feedback = writeFeedback(report);
  return report;
}

// turns the numbers into short sentences
function writeFeedback(r) {
  const strengths = [];
  const improve = [];
  const next = [];
  const ind = r.individual;

  if (ind.total) {
    const line = `You completed ${ind.done} of ${ind.total} individual tasks (${ind.pct}%).`;
    if (ind.pct >= 75) strengths.push(line);
    else if (ind.pct < 50) improve.push(line + ' Less than half of your individual work was finished.');
    else improve.push(line + ' There is room to finish more of your individual work.');
  }

  if (ind.timed >= 2) {
    const line = `${ind.onTime} of ${ind.timed} finished tasks were completed on or before the deadline (${ind.onTimePct}%).`;
    if (ind.onTimePct >= 80) strengths.push(line);
    else improve.push(line + ' Try starting tasks earlier so they are not finished late.');
  }

  if (ind.overdue) {
    improve.push(`${ind.overdue} individual ${ind.overdue === 1 ? 'task is' : 'tasks are'} past the deadline and still not completed.`);
    next.push('Finish or reschedule the overdue tasks first.');
  }

  // best and weakest module (only modules with 2 or more tasks)
  const ranked = ind.modules.filter((m) => m.total >= 2).sort((a, b) => b.pct - a.pct);
  if (ranked.length >= 2) {
    const best = ranked[0];
    const weak = ranked[ranked.length - 1];
    if (best.pct > weak.pct) {
      strengths.push(`Your strongest module was ${best.name} with ${best.done} of ${best.total} tasks completed.`);
      improve.push(`${weak.name} had the lowest completion with ${weak.done} of ${weak.total} tasks completed.`);
      next.push(`Give ${weak.name} more time at the start of next semester.`);
    }
  }

  r.groups.forEach((g) => {
    if (!g.done) {
      improve.push(`No tasks were completed in ${g.name} yet.`);
      return;
    }
    const line = `In ${g.name} you completed ${g.myDone} of the ${g.done} finished tasks (${g.myShare}%). An equal share in a group of ${g.members.length} is ${g.equalShare}%.`;
    if (g.members.length === 1) return;
    if (g.myShare >= g.equalShare) strengths.push(line);
    else improve.push(line);
  });

  if (r.group.overdue) {
    improve.push(`${r.group.overdue} group ${r.group.overdue === 1 ? 'task' : 'tasks'} assigned to you ${r.group.overdue === 1 ? 'is' : 'are'} overdue.`);
    next.push('Tell your group if you need help with the overdue group tasks, or reassign them.');
  }
  if (r.groups.length && !r.group.meetings) next.push('Turn on meeting minutes in your group calls so decisions and action items are saved.');
  if (r.group.meetings) strengths.push(`Your groups saved minutes for ${r.group.meetings} ${r.group.meetings === 1 ? 'meeting' : 'meetings'}.`);

  // year long modules go on after this semester
  ind.modules.filter((m) => m.yearLong).forEach((m) => {
    const left = m.total - m.done;
    next.push(left
      ? `${m.name} is a year long module, so it continues next semester with ${left} unfinished ${left === 1 ? 'task' : 'tasks'}.`
      : `${m.name} is a year long module and continues next semester.`);
  });

  if (!next.length) next.push('Keep the same routine next semester and upload your new module folder early.');
  return { strengths, improve, next };
}

// ---------- when the semester ends ----------

const dayOf = (time) => new Date(time).toLocaleDateString('en-CA'); // yyyy-mm-dd in local time

// the last day of the semester: the date the student set in their profile,
// or the date of their last exam. exams from a semester that is already
// closed do not count
export function semesterEnd(d, me) {
  if (d.semEnd?.[me]) return d.semEnd[me];
  const lastClosed = d.reports?.[me]?.[0]?.closedAt;
  const after = lastClosed ? dayOf(lastClosed) : '';
  const dates = (d.exams[me] || []).map((e) => e.date).filter((date) => date > after).sort();
  return dates[dates.length - 1] || '';
}

// true from the day after the semester ended. the report is then sent
// to the student as a notification
export function reportReady(d, me, now = Date.now()) {
  const end = semesterEnd(d, me);
  return !!end && dayOf(now) > end;
}

// saves the report, marks the finished tasks as counted and moves the
// student to the next semester. unfinished tasks carry over
export function closeSemester(db, me, report) {
  db.reports = db.reports || {};
  db.reportClosed = db.reportClosed || {};

  db.reports[me] = [{ id: uid('r'), closedAt: Date.now(), report }, ...(db.reports[me] || [])];

  const finished = [
    ...(db.solo[me] || []).filter((t) => t.status === 'done').map((t) => t.id),
    ...db.projects.filter((p) => p.members.includes(me)).flatMap((p) => p.tasks.filter((t) => t.col === 'done').map((t) => t.id)),
  ];
  db.reportClosed[me] = [...new Set([...(db.reportClosed[me] || []), ...finished])];

  if (db.semEnd) delete db.semEnd[me]; // the next semester gets its own end date

  // a module that runs for 1 semester is finished now. a year long module
  // continues for 1 more semester and is finished when that one is closed
  (db.modules[me] || []).forEach((m) => {
    if (m.endedIn) return;
    if (m.duration === 'year' && !m.continued) m.continued = report.semester;
    else m.endedIn = report.semester;
  });

  const user = db.users.find((u) => u.id === me);
  const i = SEMS.indexOf(user.sem);
  if (i >= 0 && i < SEMS.length - 1) user.sem = SEMS[i + 1];

  logPersonal(db, me, `closed **${report.semester}** and saved the feedback report`);
}
