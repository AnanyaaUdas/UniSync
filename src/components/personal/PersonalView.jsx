// individual page: my own kanban board with a side panel that shows
// my next deadlines, exams and my activity
import React, { useState } from 'react';
import Kanban from '../common/Kanban';
import ActivityFeed from '../common/ActivityFeed';
import Icon from '../common/Icon';
import { Avatar, Empty, Modal, ModalActions } from '../common/ui';
import { useDB, update, logPersonal } from '../../store/db';
import { COLS, colById, DEADLINE_KINDS } from '../../lib/constants';
import { urgency, fmtShort, daysTo, dayFromNow, uid } from '../../lib/format';

const NO_MODULE = { code: 'N/A', name: 'No module', color: '#94a3b8' };

export default function PersonalView({ me, goSchedule }) {
  const modules = useDB((d) => d.modules[me] || []);
  const tasks = useDB((d) => d.solo[me] || []);
  const exams = useDB((d) => d.exams[me] || []);
  const feed = useDB((d) => d.personalFeed[me] || []);
  const [filter, setFilter] = useState('all'); // 'all' or a module id
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [tab, setTab] = useState('deadlines'); // side panel tab

  const moduleOf = (id) => modules.find((m) => m.id === id) || NO_MODULE;
  const shown = tasks.filter((t) => filter === 'all' || t.mod === filter);
  const selected = modules.find((m) => m.id === filter);

  // tasks not done yet and not past, closest first
  const upcoming = tasks
    .filter((t) => t.status !== 'done' && daysTo(t.due) >= 0)
    .sort((a, b) => (a.due < b.due ? -1 : 1));
  const nextExams = exams.filter((e) => daysTo(e.date) >= 0);

  function moveTask(id, col) {
    update((db) => {
      const task = db.solo[me].find((t) => t.id === id);
      if (!task || task.status === col) return;
      task.status = col;
      logPersonal(db, me, `moved **${task.title}** to ${colById(col).name}`);
    });
  }

  function deleteTask(task) {
    update((db) => {
      db.solo[me] = db.solo[me].filter((t) => t.id !== task.id);
      logPersonal(db, me, `deleted **${task.title}**`);
    });
  }

  // the small status button on a card moves it to the next column
  function nextStatus(task) {
    const i = COLS.findIndex((c) => c.id === task.status);
    moveTask(task.id, COLS[(i + 1) % COLS.length].id);
  }

  function taskCard(task) {
    const u = urgency(task.due);
    const m = moduleOf(task.mod);
    const status = colById(task.status);
    const kind = DEADLINE_KINDS[task.kind];
    return (
      <article className="tcard bg-white border line rounded-xl p-3.5" onDoubleClick={() => setEditing(task)}>
        <div className="flex items-start gap-1.5 mb-2">
          <div className="flex flex-wrap gap-1.5 flex-1">
            <span className="badge" style={{ background: m.color + '1a', color: m.color }}>{m.code}</span>
            <span className="badge" style={{ background: u.bg, color: u.fg }}>{u.label}</span>
          </div>
          <button onClick={() => deleteTask(task)} title="Delete task" aria-label="Delete task" className="btn text-slate-300 hover:text-rose-500 p-0.5"><Icon name="x" size={15} /></button>
        </div>
        <div className={`text-[13.5px] font-semibold leading-snug ${task.status === 'done' ? 'line-through text-slate-400' : ''}`}>{task.title}</div>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <Avatar id={me} size={26} />
          <span className="text-[12px] muted whitespace-nowrap">{fmtShort(task.due)}{kind ? ` · ${kind}` : ''}</span>
          <button onClick={() => nextStatus(task)} title="Move to next stage" className="btn ml-auto badge" style={{ background: status.bg, color: status.color }}>
            {status.name} <Icon name="arrowRight" size={11} />
          </button>
        </div>
      </article>
    );
  }

  const sideTabs = [
    ['deadlines', 'Deadlines', 'clock', upcoming.length],
    ['exams', 'Exams', 'calendar', nextExams.length],
    ['activity', 'Activity', 'activity', 0],
  ];

  return (
    <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-7">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">{selected ? selected.name : 'Individual Workspace'}</h1>
          <p className="text-[14px] mt-1 muted">Individual board · {selected ? selected.code : `${modules.length} modules`} · {shown.length} tasks</p>
        </div>
        <button onClick={() => setAdding(true)} className="btn grad text-white font-bold px-4 py-2.5 rounded-xl text-[13px] inline-flex items-center gap-1.5">
          <Icon name="plus" size={16} /> Add Task
        </button>
      </div>

      {/* module filter */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
        <button onClick={() => setFilter('all')} className={`btn shrink-0 px-3.5 py-2 rounded-xl text-[12.5px] font-bold border ${filter === 'all' ? 'grad text-white border-transparent' : 'bg-white line'}`}>All modules</button>
        {modules.map((m) => {
          const on = filter === m.id;
          const left = tasks.filter((t) => t.mod === m.id && t.status !== 'done').length;
          return (
            <button key={m.id} onClick={() => setFilter(m.id)} style={on ? { background: m.color } : {}}
              className={`btn shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-xl text-[12.5px] font-bold border ${on ? 'text-white border-transparent' : 'bg-white line'}`}>
              <span className="w-2 h-2 rounded-full" style={{ background: on ? '#fff' : m.color }} />
              {m.code} · {m.name}
              <span className="opacity-70">{left}</span>
            </button>
          );
        })}
      </div>

      {/* board on the left, side panel on the right that stays on screen while scrolling */}
      <div className="grid xl:grid-cols-[minmax(0,1fr)_300px] 2xl:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
        <Kanban items={shown} colOf={(t) => t.status} onMove={moveTask} renderCard={taskCard} onAdd={() => setAdding(true)} />

        <aside className="card xl:sticky xl:top-[84px] flex flex-col xl:h-[calc(100vh-108px)] overflow-hidden">
          <div className="grid grid-cols-2 gap-2 p-3 border-b line">
            <button onClick={() => setTab('deadlines')} className="text-left p-2.5 rounded-xl hover:bg-slate-50">
              <div className="text-[11px] font-bold muted">NEXT DEADLINE</div>
              <div className="text-[18px] font-extrabold mt-0.5" style={{ color: upcoming[0] ? urgency(upcoming[0].due).fg : '#64748b' }}>
                {upcoming[0] ? `${daysTo(upcoming[0].due)}d` : 'None'}
              </div>
              <div className="text-[11.5px] muted truncate">{upcoming[0]?.title || 'All caught up'}</div>
            </button>
            <button onClick={() => setTab('exams')} className="text-left p-2.5 rounded-xl hover:bg-slate-50">
              <div className="text-[11px] font-bold muted">NEXT EXAM</div>
              <div className="text-[18px] font-extrabold mt-0.5 text-rose-600">{nextExams[0] ? `${daysTo(nextExams[0].date)}d` : 'None'}</div>
              <div className="text-[11.5px] muted truncate">{nextExams[0]?.sub || 'No routine yet'}</div>
            </button>
          </div>

          <div className="flex gap-1 p-2 border-b line">
            {sideTabs.map(([key, label, icon, count]) => (
              <button key={key} onClick={() => setTab(key)}
                className={`btn flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12.5px] font-bold ${tab === key ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}>
                <Icon name={icon} size={14} /> {label} {count > 0 && <span className="opacity-60">{count}</span>}
              </button>
            ))}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-2 max-h-[420px] xl:max-h-none">
            {tab === 'deadlines' && !upcoming.length && <div className="p-2"><Empty>All caught up.</Empty></div>}
            {tab === 'deadlines' && upcoming.map((t) => {
              const m = moduleOf(t.mod);
              const days = daysTo(t.due);
              const u = urgency(t.due);
              return (
                <div key={t.id} className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-slate-50">
                  <span className="w-1.5 h-8 rounded-full shrink-0" style={{ background: m.color }} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold truncate" title={t.title}>{t.title}</div>
                    <div className="text-[11.5px] muted">{m.code} · {fmtShort(t.due)}</div>
                  </div>
                  <span className="badge shrink-0" style={{ background: u.bg, color: u.fg }}>{days === 0 ? 'Today' : `${days}d`}</span>
                </div>
              );
            })}

            {tab === 'exams' && !nextExams.length && (
              <div className="p-4 text-center">
                <p className="text-[13px] mb-3 muted">No exam routine uploaded yet.</p>
                <button onClick={goSchedule} className="btn px-4 py-2.5 rounded-xl grad text-white text-[13px] font-bold">Upload exam schedule</button>
              </div>
            )}
            {tab === 'exams' && nextExams.map((e) => {
              const days = daysTo(e.date);
              let color = 'bg-indigo-100 text-indigo-700';
              if (days <= 3) color = 'bg-rose-100 text-rose-700';
              else if (days <= 10) color = 'bg-amber-100 text-amber-700';
              return (
                <div key={e.id} className="flex items-center gap-3 px-2.5 py-2 rounded-xl hover:bg-slate-50">
                  <div className={`w-10 h-10 rounded-xl grid place-items-center font-extrabold text-[12.5px] shrink-0 ${color}`}>{days}d</div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-bold truncate">{e.sub}</div>
                    <div className="text-[11.5px] muted truncate">{fmtShort(e.date)} · {e.time} · {e.room}</div>
                  </div>
                </div>
              );
            })}

            {tab === 'activity' && <ActivityFeed items={feed} bare />}
          </div>
        </aside>
      </div>

      {(adding || editing) && (
        <TaskPopup me={me} modules={modules} task={editing} defaultModule={filter}
          onClose={() => { setAdding(false); setEditing(null); }} />
      )}
    </main>
  );
}

// popup to add a new task, or edit one when `task` is given
function TaskPopup({ me, modules, task, defaultModule, onClose }) {
  function submit(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const data = {
      title: form.get('title'),
      mod: form.get('mod'),
      due: form.get('due'),
      status: form.get('status'),
      kind: form.get('kind'),
    };
    update((db) => {
      db.solo[me] = db.solo[me] || [];
      if (task) {
        Object.assign(db.solo[me].find((t) => t.id === task.id), data);
        logPersonal(db, me, `edited **${data.title}**`);
      } else {
        db.solo[me].unshift({ id: uid('s'), source: 'manual', ...data });
        logPersonal(db, me, `created **${data.title}** in ${colById(data.status).name}`);
      }
    });
    onClose();
  }

  const startModule = task?.mod || (defaultModule !== 'all' ? defaultModule : modules[0]?.id);

  return (
    <Modal title={task ? 'Edit individual task' : 'Add individual task'} sub="Goes on your own board. You can drag it between columns any time." onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="lbl">TASK TITLE</label>
          <input name="title" required defaultValue={task?.title} placeholder="e.g. Finish DBMS tutorial sheet 4" className="field mt-1.5" />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="lbl">MODULE</label>
            <select name="mod" defaultValue={startModule} className="field mt-1.5">
              {modules.map((m) => <option key={m.id} value={m.id}>{m.code} · {m.name}</option>)}
            </select>
          </div>
          <div>
            <label className="lbl">DEADLINE</label>
            <input name="due" type="date" required defaultValue={task?.due || dayFromNow(96)} className="field mt-1.5" />
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="lbl">STATUS</label>
            <select name="status" defaultValue={task?.status || 'todo'} className="field mt-1.5">
              {COLS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="lbl">TYPE</label>
            <select name="kind" defaultValue={task?.kind || 'assignment'} className="field mt-1.5">
              {Object.entries(DEADLINE_KINDS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </div>
        </div>
        <ModalActions onCancel={onClose} submitLabel={task ? 'Save' : 'Create task'} />
      </form>
    </Modal>
  );
}
