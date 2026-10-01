// group page: kanban board for one group project, live activity,
// the call banner and the popups to add tasks and members.
// the tabs switch between the board, the progress charts and the canvas
import React, { Suspense, lazy, useState } from 'react';
import Kanban from '../common/Kanban';
import ActivityFeed from '../common/ActivityFeed';
import TaskDrawer from './TaskDrawer';
import GroupProgress from './GroupProgress';
import Icon from '../common/Icon';
import { Avatar, Modal, ModalActions } from '../common/ui';
import { useDB, update, logTeam, userById, displayName } from '../../store/db';
import { useOnline } from '../../store/presence';
import { colById, TAGS, TAG_COLORS } from '../../lib/constants';
import { urgency, fmtShort, dayFromNow, firstName, uid } from '../../lib/format';
import { liveCall } from '../call/callActions';
import { setStage } from '../../lib/progress';

// the canvas is only downloaded when someone opens it, so the app stays fast
const CanvasBoard = lazy(() => import('../canvas/CanvasBoard'));

const PAGES = [['board', 'Board', 'board'], ['progress', 'Progress', 'pie'], ['canvas', 'Canvas', 'shapes']];

export default function TeamView({ me, projId, openChat, startCall, onUpload }) {
  const d = useDB();
  const project = d.projects.find((p) => p.id === projId);
  const online = useOnline();
  const [filter, setFilter] = useState('all'); // show everyone's tasks or one member's
  const [openTask, setOpenTask] = useState(null);
  const [popup, setPopup] = useState(null); // 'task', 'member' or null
  const [page, setPage] = useState('board'); // board, progress or canvas

  if (!project) {
    return (
      <main className="max-w-[900px] mx-auto px-4 py-16 text-center">
        <div className="w-14 h-14 rounded-2xl mx-auto mb-3 grid place-items-center text-indigo-600" style={{ background: 'var(--tint)' }}><Icon name="users" size={26} /></div>
        <h1 className="text-2xl font-extrabold">No group coursework yet</h1>
        <p className="muted mt-2 text-[14px] max-w-md mx-auto">Group projects are created automatically. Upload your module briefs, slides or coursework dates and UniSync will create a project for every piece of group coursework it finds. Then add your group with + Member.</p>
        <button onClick={onUpload} className="btn mt-5 px-5 py-3 rounded-xl grad text-white font-bold text-[13px] inline-flex items-center gap-2">
          <Icon name="upload" size={16} /> Upload coursework files
        </button>
      </main>
    );
  }

  const tasks = project.tasks.filter((t) => filter === 'all' || t.assignee === filter);
  const call = liveCall(d.calls[project.id]);
  const inCall = call ? [...new Set(Object.values(call.participants).map((p) => p.userId))] : [];
  const onlineCount = project.members.filter((m) => online.has(m)).length;

  // moving a task always logs me (the person who moved it), not the task owner
  function moveTask(taskId, col) {
    update((db) => {
      const task = db.projects.find((p) => p.id === project.id).tasks.find((t) => t.id === taskId);
      if (!task || task.col === col) return;
      setStage(task, 'col', col, me);
      const owner = task.assignee !== me ? ` (${firstName(displayName(userById(db, task.assignee)))}'s task)` : '';
      logTeam(db, project.id, me, `moved **${task.title}**${owner} to ${colById(col).name}`);
    });
  }

  function taskCard(task) {
    const u = urgency(task.due);
    const done = task.subs.filter((s) => s.d).length;
    const tagColor = TAG_COLORS[task.tag] || '#475569';
    return (
      <article onClick={() => setOpenTask(task.id)} className="tcard bg-white border line rounded-xl p-3.5">
        <div className="flex items-center gap-2 mb-2">
          <span className="badge" style={{ background: tagColor + '1a', color: tagColor }}>{task.tag}</span>
          <span className="badge" style={{ background: u.bg, color: u.fg }}>{u.label}</span>
        </div>
        <div className="text-[13.5px] font-semibold leading-snug">{task.title}</div>
        <div className="flex items-center gap-2 mt-3">
          <Avatar id={task.assignee} size={26} showOnline />
          <span className="text-[12px] muted">{fmtShort(task.due)}</span>
          <span className="ml-auto text-[12px] font-semibold muted inline-flex items-center gap-1"><Icon name="checkSquare" size={13} /> {done}/{task.subs.length}</span>
          {task.comments.length > 0 && <span className="text-[12px] font-semibold muted inline-flex items-center gap-1"><Icon name="message" size={13} /> {task.comments.length}</span>}
        </div>
        {task.subs.length > 0 && (
          <div className="h-1.5 rounded-full mt-3" style={{ background: 'var(--soft2)' }}>
            <div className="h-1.5 rounded-full grad" style={{ width: `${Math.round((done / task.subs.length) * 100)}%` }} />
          </div>
        )}
      </article>
    );
  }

  return (
    <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-7">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">{project.name}</h1>
          <p className="text-[14px] mt-1 muted">
            {project.sub} · {project.members.length}{project.groupSize ? `/${project.groupSize}` : ''} members · {project.tasks.length} tasks · <span className="text-emerald-600 font-semibold">{onlineCount} online</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex -space-x-2 mr-1">{project.members.map((m) => <Avatar key={m} id={m} size={32} showOnline />)}</div>
          <button onClick={() => setPopup('member')} className="btn px-3 py-2.5 rounded-xl border line bg-white text-[13px] font-bold">+ Member</button>
          <button onClick={() => setPopup('task')} className="btn grad text-white font-bold px-4 py-2.5 rounded-xl text-[13px]">+ Add Task</button>
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="px-3.5 py-2.5 rounded-xl border line bg-white text-[13px] font-semibold outline-none">
            <option value="all">All members</option>
            {project.members.map((m) => <option key={m} value={m}>{displayName(userById(d, m))}</option>)}
          </select>
        </div>
      </div>

      {call && (
        <div className="fade card p-3.5 mb-5 flex flex-wrap items-center gap-3" style={{ background: 'var(--tint-green)', borderColor: '#a7f3d0' }}>
          <span className="w-9 h-9 rounded-full bg-emerald-500 text-white grid place-items-center ring-pulse"><Icon name="video" size={18} /></span>
          <div className="flex-1 min-w-[160px]">
            <div className="font-bold text-[13.5px]">Video call in progress</div>
            <div className="text-[12px] muted">
              {inCall.map((u) => firstName(displayName(userById(d, u)))).join(', ')}
              {call.notes ? ` · meeting ${call.notes.mode === 'log' ? 'log' : 'minutes'} on` : ''}
            </div>
          </div>
          <div className="flex -space-x-2">{inCall.map((u) => <Avatar key={u} id={u} size={28} />)}</div>
          <button onClick={() => startCall(project.id)} className="btn px-4 py-2 rounded-xl bg-emerald-600 text-white text-[13px] font-bold">Join call</button>
        </div>
      )}

      <nav className="inline-flex p-1 rounded-xl mb-5" style={{ background: 'var(--soft2)' }}>
        {PAGES.map(([key, label, icon]) => (
          <button key={key} onClick={() => setPage(key)}
            className={`btn px-3.5 py-1.5 rounded-lg text-[13px] font-bold inline-flex items-center gap-1.5 ${page === key ? 'bg-white shadow text-indigo-700' : 'text-slate-500'}`}>
            <Icon name={icon} size={15} /> {label}
          </button>
        ))}
      </nav>

      {page === 'progress' && <GroupProgress project={project} />}

      {page === 'canvas' && (
        <Suspense fallback={<div className="card p-10 text-center text-[13px] muted">Loading canvas…</div>}>
          <CanvasBoard me={me} project={project} />
        </Suspense>
      )}

      {page === 'board' && <div className="grid xl:grid-cols-4 gap-5">
        <div className="xl:col-span-3 min-w-0">
          <Kanban items={tasks} colOf={(t) => t.col} onMove={moveTask} renderCard={taskCard} onAdd={() => setPopup('task')} />
        </div>
        <ActivityFeed items={project.feed} footer={
          <div className="grid grid-cols-2 gap-2 mt-4">
            <button onClick={openChat} className="btn py-2.5 rounded-xl border line text-[13px] font-bold inline-flex items-center justify-center gap-2">
              <Icon name="message" size={16} /> Group chat
            </button>
            <button onClick={() => startCall(project.id)} className="btn py-2.5 rounded-xl grad text-white text-[13px] font-bold inline-flex items-center justify-center gap-2">
              <Icon name="video" size={16} /> {call ? 'Join' : 'Start'} call
            </button>
          </div>
        } />
      </div>}

      {openTask && <TaskDrawer me={me} project={project} taskId={openTask} onClose={() => setOpenTask(null)} />}
      {popup === 'task' && <NewTaskPopup me={me} project={project} onClose={() => setPopup(null)} />}
      {popup === 'member' && <AddMemberPopup me={me} project={project} onClose={() => setPopup(null)} />}
    </main>
  );
}

function NewTaskPopup({ me, project, onClose }) {
  const d = useDB();

  function submit(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const task = {
      id: uid('t'),
      title: form.get('title'),
      col: 'todo',
      assignee: form.get('assignee'),
      due: form.get('due'),
      tag: form.get('tag'),
      subs: [],
      comments: [],
    };
    update((db) => {
      db.projects.find((p) => p.id === project.id).tasks.unshift(task);
      const givenTo = task.assignee === me ? '' : ` and assigned it to ${firstName(displayName(userById(db, task.assignee)))}`;
      logTeam(db, project.id, me, `created **${task.title}** in To Do${givenTo}`);
    });
    onClose();
  }

  return (
    <Modal title="Add task to board" sub={`New tasks land in To Do on ${project.name}.`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="lbl">TASK TITLE</label>
          <input name="title" required placeholder="e.g. Build results dashboard endpoint" className="field mt-1.5" />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="lbl">ASSIGNEE</label>
            <select name="assignee" defaultValue={me} className="field mt-1.5">
              {project.members.map((m) => <option key={m} value={m}>{displayName(userById(d, m))}</option>)}
            </select>
          </div>
          <div>
            <label className="lbl">DEADLINE</label>
            <input name="due" type="date" required defaultValue={dayFromNow(96)} className="field mt-1.5" />
          </div>
        </div>
        <div>
          <label className="lbl">CATEGORY</label>
          <select name="tag" className="field mt-1.5">{TAGS.map((t) => <option key={t}>{t}</option>)}</select>
        </div>
        <ModalActions onCancel={onClose} submitLabel="Create task" />
      </form>
    </Modal>
  );
}

function AddMemberPopup({ me, project, onClose }) {
  const users = useDB((d) => d.users);
  const notInGroup = users.filter((u) => !project.members.includes(u.id));
  const [error, setError] = useState('');

  function addMember(id) {
    update((db) => {
      const p = db.projects.find((x) => x.id === project.id);
      if (p.members.includes(id)) return;
      p.members.push(id);
      logTeam(db, project.id, me, `added **${displayName(userById(db, id))}** to the project`);

      // if they uploaded the same coursework they have their own copy of this
      // project. when nobody has worked in it yet we remove it, so they do
      // not see the same project twice
      const untouched = (x) => x.members.length === 1 && x.members[0] === id
        && x.tasks.every((t) => t.col === 'todo' && !t.comments.length) && !x.chat.some((c) => !c.type);
      db.projects = db.projects.filter((x) => x.id === p.id || x.key !== p.key || !untouched(x));
    });
    onClose();
  }

  // find the student by their email or full name
  function submit(e) {
    e.preventDefault();
    const search = new FormData(e.currentTarget).get('who').trim().toLowerCase();
    const found = users.find((u) => u.email.toLowerCase() === search || u.name.toLowerCase() === search);
    if (!found) {
      setError('No UniSync student found with that name or email. They need to sign up first.');
      return;
    }
    addMember(found.id);
  }

  return (
    <Modal title="Add team member" sub={`They'll join ${project.name} and can be assigned tasks.`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="lbl">NAME OR STUDENT EMAIL</label>
          <input name="who" required placeholder="e.g. NP01CP4A240001@islingtoncollege.edu.np" className="field mt-1.5" />
        </div>
        {error && <div className="p-3 rounded-xl text-[12.5px] font-semibold" style={{ background: '#fee2e2', color: '#b91c1c' }}>{error}</div>}
        {notInGroup.length > 0 && (
          <div>
            <div className="lbl mb-2">OR PICK FROM YOUR CLASSMATES</div>
            <div className="flex flex-wrap gap-2">
              {notInGroup.map((u) => (
                <button type="button" key={u.id} onClick={() => addMember(u.id)} className="btn flex items-center gap-2 px-2.5 py-1.5 rounded-xl border line text-[12.5px] font-bold">
                  <Avatar id={u.id} size={22} ring={false} /> {u.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <ModalActions onCancel={onClose} submitLabel="Add member" />
      </form>
    </Modal>
  );
}
