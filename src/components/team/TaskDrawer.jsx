// panel that opens when you click a group task. you can change the
// person and deadline, tick sub-tasks, comment, move or delete the task.
// every change is added to the group's live activity with my name
import React, { useEffect } from 'react';
import { Avatar } from '../common/ui';
import Icon from '../common/Icon';
import { useDB, update, logTeam, userById, displayName } from '../../store/db';
import { COLS, colById, TAG_COLORS } from '../../lib/constants';
import { urgency, fmtDate, timeAgo, uid, firstName } from '../../lib/format';

export default function TaskDrawer({ me, project, taskId, onClose }) {
  const d = useDB();
  const task = project.tasks.find((t) => t.id === taskId);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!task) return null;

  const u = urgency(task.due);
  const done = task.subs.filter((s) => s.d).length;
  const percent = task.subs.length ? Math.round((done / task.subs.length) * 100) : 0;
  const tagColor = TAG_COLORS[task.tag] || '#475569';
  const nameOf = (db, id) => firstName(displayName(userById(db, id)));

  // change this task and write a line in the activity feed
  function changeTask(change) {
    update((db) => {
      const t = db.projects.find((p) => p.id === project.id).tasks.find((x) => x.id === taskId);
      const message = change(t, db);
      if (message) logTeam(db, project.id, me, message);
    });
  }

  const setAssignee = (id) => changeTask((t, db) => {
    t.assignee = id;
    return `reassigned **${t.title}** to ${nameOf(db, id)}`;
  });

  const setDeadline = (date) => changeTask((t) => {
    t.due = date;
    return `changed the deadline of **${t.title}** to ${fmtDate(date)}`;
  });

  const tickSub = (i, checked) => changeTask((t) => {
    t.subs[i].d = checked;
    return `${checked ? 'completed' : 'reopened'} sub-task **${t.subs[i].t}**`;
  });

  const moveTo = (col) => changeTask((t, db) => {
    if (t.col === col) return null;
    t.col = col;
    const owner = t.assignee !== me ? ` (${nameOf(db, t.assignee)}'s task)` : '';
    return `moved **${t.title}**${owner} to ${colById(col).name}`;
  });

  function addSub(e) {
    e.preventDefault();
    const text = new FormData(e.currentTarget).get('text');
    e.currentTarget.reset();
    changeTask((t) => {
      t.subs.push({ t: text, d: false });
      return `added sub-task **${text}** to ${t.title}`;
    });
  }

  function addComment(e) {
    e.preventDefault();
    const text = new FormData(e.currentTarget).get('text');
    e.currentTarget.reset();
    changeTask((t) => {
      t.comments.push({ id: uid('c'), who: me, txt: text, at: Date.now() });
      return `commented on **${t.title}**`;
    });
  }

  function deleteTask() {
    update((db) => {
      const p = db.projects.find((x) => x.id === project.id);
      p.tasks = p.tasks.filter((t) => t.id !== taskId);
      logTeam(db, project.id, me, `deleted **${task.title}**`);
    });
    onClose();
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/40" onClick={onClose} />
      <aside className="slidein fixed top-0 right-0 z-50 h-full w-full sm:w-[460px] bg-white border-l line overflow-y-auto p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <div className="flex gap-2 mb-2">
              <span className="badge" style={{ background: tagColor + '1a', color: tagColor }}>{task.tag}</span>
              <span className="badge" style={{ background: u.bg, color: u.fg }}>{u.label}</span>
            </div>
            <h2 className="text-xl font-extrabold tracking-tight leading-snug">{task.title}</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="btn p-1 text-slate-400 hover:text-slate-700"><Icon name="x" size={20} /></button>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-5">
          <div className="p-3 rounded-xl" style={{ background: 'var(--soft)' }}>
            <div className="text-[11px] font-bold muted">ASSIGNEE</div>
            <div className="flex items-center gap-2 mt-2">
              <Avatar id={task.assignee} size={26} />
              <select value={task.assignee} onChange={(e) => setAssignee(e.target.value)} className="text-[13px] font-semibold bg-transparent outline-none min-w-0 flex-1">
                {project.members.map((m) => <option key={m} value={m}>{displayName(userById(d, m))}</option>)}
              </select>
            </div>
          </div>
          <div className="p-3 rounded-xl" style={{ background: 'var(--soft)' }}>
            <div className="text-[11px] font-bold muted">DEADLINE</div>
            <input type="date" value={task.due} onChange={(e) => setDeadline(e.target.value)} className="text-[13px] font-semibold mt-2 bg-transparent outline-none" />
          </div>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-[14px]">Sub-tasks & milestones</h3>
            <span className="text-[12px] font-semibold muted">{done}/{task.subs.length}</span>
          </div>
          <div className="h-1.5 rounded-full mb-3" style={{ background: 'var(--soft2)' }}>
            <div className="h-1.5 rounded-full grad" style={{ width: `${percent}%` }} />
          </div>
          <div className="space-y-2">
            {task.subs.map((s, i) => (
              <label key={i} className="flex items-center gap-3 p-2.5 rounded-xl border line cursor-pointer">
                <input type="checkbox" checked={s.d} onChange={(e) => tickSub(i, e.target.checked)} className="w-4 h-4 accent-indigo-600" />
                <span className={`text-[13px] ${s.d ? 'line-through text-slate-400' : ''}`}>{s.t}</span>
              </label>
            ))}
          </div>
          <form className="flex gap-2 mt-2" onSubmit={addSub}>
            <input name="text" required placeholder="Add sub-task…" className="field flex-1" />
            <button className="btn px-4 rounded-xl border line font-bold text-[13px]">Add</button>
          </form>
        </div>

        <div className="mt-6">
          <h3 className="font-bold text-[14px] mb-1">Task discussion ({task.comments.length})</h3>
          <p className="text-[12px] mb-3 muted">Comments here stay attached to this task only.</p>
          <div className="space-y-3">
            {!task.comments.length && <div className="text-[13px] muted">No comments yet. Start the thread.</div>}
            {task.comments.map((c) => (
              <div key={c.id} className="flex gap-3">
                <Avatar id={c.who} size={30} />
                <div className="flex-1 p-3 rounded-xl" style={{ background: 'var(--soft)' }}>
                  <div className="text-[12px] font-bold">{displayName(userById(d, c.who))} <span className="font-medium muted">· {timeAgo(c.at)}</span></div>
                  <div className="text-[13px] mt-1 leading-snug">{c.txt}</div>
                </div>
              </div>
            ))}
          </div>
          <form className="flex gap-2 mt-4" onSubmit={addComment}>
            <Avatar id={me} size={30} />
            <input name="text" required placeholder="Write a comment…" className="field flex-1" />
            <button className="btn grad text-white font-bold px-4 rounded-xl text-[13px]">Send</button>
          </form>
        </div>

        <div className="mt-6">
          <h3 className="font-bold text-[14px] mb-2">Move to</h3>
          <div className="flex flex-wrap gap-2">
            {COLS.map((col) => (
              <button key={col.id} onClick={() => moveTo(col.id)}
                className={`btn px-3.5 py-2 rounded-xl text-[12.5px] font-bold border ${task.col === col.id ? 'grad text-white border-transparent' : 'bg-white text-slate-600 line'}`}>
                {col.name}
              </button>
            ))}
          </div>
          <button onClick={deleteTask} className="btn mt-6 w-full py-2.5 rounded-xl border line text-[13px] font-bold text-rose-600 hover:bg-rose-50">Delete task</button>
        </div>
      </aside>
    </>
  );
}
