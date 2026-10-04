// helpers for the progress charts and the semester report:
// counting tasks by status, who did how much in a group, and
// remembering when a task was finished
import { COLS } from './constants';
import { daysTo } from './format';

// chart colour for each kanban column. the real values are in index.css
// so they can be a bit brighter in dark mode
export const STATUS_COLOR = {
  todo: 'var(--st-todo)',
  progress: 'var(--st-progress)',
  review: 'var(--st-review)',
  done: 'var(--st-done)',
};

// 3 of 4 -> 75
export const percent = (part, total) => (total ? Math.round((part / total) * 100) : 0);

// move a task to a column and remember when it was finished and who moved it.
// field is 'col' for group tasks and 'status' for individual tasks
export function setStage(task, field, col, who) {
  task[field] = col;
  if (col === 'done') {
    task.doneAt = Date.now();
    if (who) task.doneBy = who;
  } else {
    delete task.doneAt;
    delete task.doneBy;
  }
}

// yyyy-mm-dd in local time
const localDay = (time) => new Date(time).toLocaleDateString('en-CA');

// true = finished on or before the deadline, false = finished late,
// null = we don't know (finished before the app started saving the date)
export function finishedOnTime(task) {
  if (!task.doneAt) return null;
  return localDay(task.doneAt) <= task.due;
}

export const isOverdue = (task, stage) => stage !== 'done' && daysTo(task.due) < 0;

// one slice for each column, ready for the donut chart
export function statusSlices(tasks, stageOf) {
  return COLS.map((col) => ({
    key: col.id,
    label: col.name,
    value: tasks.filter((t) => stageOf(t) === col.id).length,
    color: STATUS_COLOR[col.id],
  }));
}

// numbers for every member of a group project.
// a finished task counts for the member it is assigned to
export function memberStats(project) {
  return project.members.map((id) => {
    const mine = project.tasks.filter((t) => t.assignee === id);
    const count = (col) => mine.filter((t) => t.col === col).length;
    const subs = mine.flatMap((t) => t.subs);
    return {
      id,
      assigned: mine.length,
      todo: count('todo'),
      progress: count('progress'),
      review: count('review'),
      done: count('done'),
      overdue: mine.filter((t) => isOverdue(t, t.col)).length,
      subsDone: subs.filter((s) => s.d).length,
      subsTotal: subs.length,
      comments: project.tasks.reduce((n, t) => n + t.comments.filter((c) => c.who === id).length, 0),
      actions: project.feed.filter((f) => f.who === id).length,
    };
  });
}
