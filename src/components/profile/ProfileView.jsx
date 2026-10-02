// schedule page: my profile card, past semester reports, modules,
// class timetable, exam dates and the files i uploaded
import React, { useState } from 'react';
import Icon from '../common/Icon';
import { Avatar, Empty, Modal, ModalActions } from '../common/ui';
import { useDB, update, userById, displayName, setSession, logPersonal } from '../../store/db';
import { daysTo, fmtDate, timeAgo, initialsOf } from '../../lib/format';
import { DEPTS, SEMS } from '../../lib/constants';
import SemesterReport from '../report/SemesterReport';
import { semesterEnd } from '../../services/semesterReport';
import { DAYS, CLASS_TYPES, REMIND_AT, classTime, classPlace } from '../../lib/classes';

export default function ProfileView({ me, onUpload }) {
  const d = useDB();
  const user = userById(d, me);
  const modules = d.modules[me] || [];
  const exams = d.exams[me] || [];
  const classes = d.classes?.[me] || [];
  const remindAt = d.remind?.[me] || REMIND_AT;
  const [addingClass, setAddingClass] = useState(false);
  const [alerts, setAlerts] = useState('Notification' in window ? Notification.permission : 'none');
  const docs = d.docs[me] || [];
  const tasks = d.solo[me] || [];
  const [editing, setEditing] = useState(false);
  const [report, setReport] = useState(null); // a saved report, or null
  const pastReports = d.reports?.[me] || [];

  const stats = [
    ['London Met ID', user.lmuId || 'n/a'],
    ['Group projects', d.projects.filter((p) => p.members.includes(me)).length],
    ['Individual tasks', tasks.length],
    ['Completed', tasks.filter((t) => t.status === 'done').length],
  ];

  // removing a module also removes its tasks
  function removeModule(m) {
    if (!confirm(`Remove ${m.name} and its tasks?`)) return;
    update((db) => {
      db.modules[me] = db.modules[me].filter((x) => x.id !== m.id);
      db.solo[me] = (db.solo[me] || []).filter((t) => t.mod !== m.id);
      logPersonal(db, me, `removed module **${m.name}**`);
    });
  }

  // a module runs for 1 semester or for the whole year
  function setDuration(id, duration) {
    update((db) => {
      db.modules[me].find((x) => x.id === id).duration = duration;
    });
  }

  function removeClass(id) {
    update((db) => {
      db.classes[me] = db.classes[me].filter((x) => x.id !== id);
    });
  }

  function setRemindAt(time) {
    if (!time) return;
    update((db) => {
      db.remind = db.remind || {};
      db.remind[me] = time;
    });
  }

  // the browser asks the student if unisync may show notifications
  async function allowAlerts() {
    setAlerts(await Notification.requestPermission());
  }

  function removeExam(id) {
    update((db) => {
      db.exams[me] = db.exams[me].filter((x) => x.id !== id);
    });
  }

  return (
    <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-7">
      <div className="mb-5">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Profile & Schedule Hub</h1>
        <p className="text-[14px] mt-1 muted">Your account, modules, class timetable, exam routine and uploaded documents.</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* profile card */}
        <div className="card p-6 h-fit">
          <div className="flex items-center gap-3">
            <Avatar id={me} size={58} />
            <div className="min-w-0">
              <div className="font-extrabold text-[17px] truncate">{displayName(user)}</div>
              <div className="text-[12.5px] truncate muted">{user.nick ? user.name + ' · ' : ''}{user.email}</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            <span className="badge" style={{ background: '#e0e7ff', color: '#4338ca' }}><Icon name="cap" size={12} /> {user.dept}</span>
            <span className="badge" style={{ background: '#ede9fe', color: '#6d28d9' }}><Icon name="book" size={12} /> {user.sem}</span>
            <span className="badge" style={{ background: '#d1fae5', color: '#047857' }}><Icon name="shield" size={12} /> Verified college email</span>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-5">
            {stats.map(([label, value]) => (
              <div key={label} className="p-3 rounded-xl" style={{ background: 'var(--soft)' }}>
                <div className="text-[11px] font-bold muted">{label.toUpperCase()}</div>
                <div className="text-[14px] font-extrabold mt-1 truncate">{value}</div>
              </div>
            ))}
          </div>
          <button onClick={() => setEditing(true)} className="btn w-full mt-5 py-2.5 rounded-xl grad text-white text-[13px] font-bold">Edit profile</button>
          <button onClick={() => setSession(null)} className="btn w-full mt-2.5 py-2.5 rounded-xl border line text-[13px] font-bold hover:bg-rose-50 hover:text-rose-600">Log out</button>
        </div>

        <div className="lg:col-span-2 space-y-5">
          <div className="card p-5 flex flex-wrap items-center gap-4" style={{ background: 'var(--hero)' }}>
            <div className="w-11 h-11 rounded-xl grid place-items-center bg-white text-indigo-600 border line"><Icon name="upload" size={20} /></div>
            <div className="flex-1 min-w-[200px]">
              <div className="font-extrabold">Upload more module, timetable or exam files</div>
              <div className="text-[12.5px] muted">Run the import again with a new modules folder, class timetable or exam routine. New modules, deadlines, classes and exams are added to what you have.</div>
            </div>
            <button onClick={onUpload} className="btn px-4 py-2.5 rounded-xl grad text-white text-[13px] font-bold">Upload folders</button>
          </div>

          {/* the report of this semester is not shown here. it is sent as a
              notification when the semester ends. closed semesters stay here */}
          {pastReports.length > 0 && (
            <div className="card p-5">
              <h3 className="font-bold text-[15px]">Past semester reports</h3>
              <div className="text-[12.5px] muted mb-3">The feedback reports of the semesters you closed. Open one to download it as a PDF.</div>
              <div className="flex flex-wrap gap-2">
                {pastReports.map((item) => (
                  <button key={item.id} onClick={() => setReport(item)} className="btn flex items-center gap-2 px-3 py-2 rounded-xl border line text-[12.5px] font-bold">
                    <Icon name="notes" size={14} className="text-indigo-600" /> {item.report.semester}
                    <span className="font-medium muted">closed {fmtDate(new Date(item.closedAt).toLocaleDateString('en-CA'))}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="card p-5">
            <div className="flex items-center gap-2 mb-3">
              <h3 className="font-bold text-[15px]">Modules</h3>
              <span className="badge" style={{ background: '#e0e7ff', color: '#4338ca' }}>{modules.length}</span>
            </div>
            {!modules.length && <Empty>No modules yet.</Empty>}
            <div className="grid sm:grid-cols-2 gap-2.5">
              {modules.map((m) => (
                <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl border line">
                  <span className="w-2.5 h-10 rounded-full" style={{ background: m.color }} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-bold truncate">{m.name}</div>
                    <div className="text-[12px] muted">{m.code} · {tasks.filter((t) => t.mod === m.id).length} tasks{m.endedIn ? ` · finished in ${m.endedIn}` : ''}</div>
                  </div>
                  <select value={m.duration || 'semester'} onChange={(e) => setDuration(m.id, e.target.value)} className="field field-sm !w-[112px] shrink-0" aria-label="How long the module runs">
                    <option value="semester">1 semester</option>
                    <option value="year">Year long</option>
                  </select>
                  <button onClick={() => removeModule(m)} title="Remove module and its tasks" aria-label="Remove" className="text-slate-300 hover:text-rose-500 p-1"><Icon name="x" size={16} /></button>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-5">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <h3 className="font-bold text-[15px]">Class timetable</h3>
              {classes.length > 0 && <span className="badge" style={{ background: '#cffafe', color: '#0e7490' }}>{classes.length} a week</span>}
              <button onClick={() => setAddingClass(true)} className="ml-auto text-[12.5px] font-bold text-indigo-600">+ Add class</button>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3 rounded-xl mb-3" style={{ background: 'var(--soft)' }}>
              <Icon name="bell" size={16} className="text-indigo-600" />
              <label className="text-[12.5px] flex items-center gap-2">
                Remind me about tomorrow's classes at
                <input type="time" value={remindAt} onChange={(e) => setRemindAt(e.target.value)} className="field field-sm !w-[110px]" aria-label="Reminder time" />
              </label>
              {alerts === 'default' && <button onClick={allowAlerts} className="btn px-3 py-1.5 rounded-lg border line bg-white text-[12px] font-bold">Allow browser notifications</button>}
              {alerts === 'granted' && <span className="badge" style={{ background: '#d1fae5', color: '#047857' }}>Browser notifications on</span>}
              {alerts === 'denied' && <span className="text-[11.5px] muted">Browser notifications are blocked for this site, so the reminder only shows inside UniSync.</span>}
            </div>
            {!classes.length && <Empty>No classes yet. Upload your class timetable with Upload folders, or add your classes here.</Empty>}
            <div className="space-y-3">
              {DAYS.map((name, day) => {
                const list = classes.filter((c) => c.day === day).sort((a, b) => (a.start < b.start ? -1 : 1));
                if (!list.length) return null;
                return (
                  <div key={name}>
                    <div className="lbl mb-1.5">{name.toUpperCase()}{day === new Date().getDay() ? ' · TODAY' : ''}</div>
                    <div className="space-y-2">
                      {list.map((c) => (
                        <div key={c.id} className="flex flex-wrap items-center gap-3 p-3 rounded-xl border line">
                          <div className="text-[12.5px] font-extrabold tabular-nums w-[104px]">{classTime(c)}</div>
                          <div className="min-w-0 flex-1 basis-[150px]">
                            <div className="text-[13.5px] font-bold truncate">{c.title}</div>
                            <div className="text-[12px] muted">{classPlace(c)}</div>
                          </div>
                          {c.code && <span className="badge" style={{ background: '#e0e7ff', color: '#4338ca' }}>{c.code}</span>}
                          <button onClick={() => removeClass(c.id)} aria-label="Remove" className="text-slate-300 hover:text-rose-500 p-1"><Icon name="x" size={16} /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card p-5">
            <div className="flex items-center gap-2 mb-3">
              <h3 className="font-bold text-[15px]">Exam dates</h3>
              {exams.length > 0 && <span className="badge" style={{ background: '#d1fae5', color: '#047857' }}>{exams.length} found</span>}
            </div>
            {!exams.length && <Empty>No exam dates yet. Upload your exam routine folder and they will be added here.</Empty>}
            <div className="space-y-2.5">
              {exams.map((e) => {
                const days = daysTo(e.date);
                let color = 'bg-indigo-100 text-indigo-700';
                if (days < 0) color = 'bg-slate-100 text-slate-500';
                else if (days <= 3) color = 'bg-rose-100 text-rose-700';
                const alarmOn = days >= 0 && days <= 10;
                return (
                  <div key={e.id} className="flex flex-wrap items-center gap-3 p-3.5 rounded-xl border line">
                    <div className={`w-12 h-12 rounded-xl grid place-items-center font-extrabold text-[13px] ${color}`}>{days < 0 ? 'done' : days + 'd'}</div>
                    <div className="min-w-0 flex-1 basis-[150px]">
                      <div className="text-[13.5px] font-bold truncate">{e.sub}</div>
                      <div className="text-[12px] muted">{fmtDate(e.date)} · {e.time} · {e.room}</div>
                    </div>
                    {e.code && <span className="badge" style={{ background: '#e0e7ff', color: '#4338ca' }}>{e.code}</span>}
                    {alarmOn
                      ? <span className="badge" style={{ background: '#fee2e2', color: '#b91c1c' }}>Alarm set</span>
                      : <span className="badge" style={{ background: 'var(--soft3)', color: '#64748b' }}>Scheduled</span>}
                    <button onClick={() => removeExam(e.id)} aria-label="Remove" className="text-slate-300 hover:text-rose-500 p-1"><Icon name="x" size={16} /></button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card p-5">
            <h3 className="font-bold text-[15px] mb-3">Uploaded documents</h3>
            {!docs.length && <Empty>No documents uploaded yet.</Empty>}
            <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
              {docs.map((doc) => (
                <div key={doc.id} className="flex items-center gap-3 p-3 rounded-xl border line">
                  <span className="w-9 h-9 rounded-lg grid place-items-center" style={{ background: 'var(--soft3)' }}><Icon name="file" size={16} className="text-slate-500" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold truncate">{doc.name}</div>
                    <div className="text-[12px] muted">{doc.kind} · {doc.size} · uploaded {timeAgo(doc.at)}</div>
                  </div>
                  <span className="badge" style={{ background: '#d1fae5', color: '#047857' }}>Read</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {addingClass && <AddClass me={me} modules={modules} onClose={() => setAddingClass(false)} />}
      {editing && <EditProfile me={me} user={user} onClose={() => setEditing(false)} />}
      {report && <SemesterReport me={me} saved={report} onClose={() => setReport(null)} />}
    </main>
  );
}

function AddClass({ me, modules, onClose }) {
  function submit(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const title = form.get('title').trim();
    const mod = modules.find((m) => m.name.toLowerCase() === title.toLowerCase());
    update((db) => {
      db.classes = db.classes || {};
      db.classes[me] = [...(db.classes[me] || []), {
        id: 'k' + Date.now().toString(36),
        day: Number(form.get('day')),
        start: form.get('start'),
        end: form.get('end'),
        title,
        code: mod?.code || '',
        type: form.get('type'),
        room: form.get('room').trim() || 'TBA',
      }];
    });
    onClose();
  }

  return (
    <Modal title="Add class" sub="A class you have every week. You get a reminder the evening before." onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="lbl">MODULE</label>
          <input name="title" required list="class-modules" defaultValue={modules[0]?.name} className="field mt-1.5" />
          <datalist id="class-modules">{modules.map((m) => <option key={m.id} value={m.name} />)}</datalist>
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label className="lbl">DAY</label>
            <select name="day" defaultValue={new Date().getDay()} className="field mt-1.5">
              {DAYS.map((name, i) => <option key={name} value={i}>{name}</option>)}
            </select>
          </div>
          <div>
            <label className="lbl">STARTS</label>
            <input name="start" type="time" required defaultValue="08:00" className="field mt-1.5" />
          </div>
          <div>
            <label className="lbl">ENDS</label>
            <input name="end" type="time" required defaultValue="09:30" className="field mt-1.5" />
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="lbl">TYPE</label>
            <select name="type" className="field mt-1.5">
              {CLASS_TYPES.map((x) => <option key={x}>{x}</option>)}
            </select>
          </div>
          <div>
            <label className="lbl">ROOM</label>
            <input name="room" placeholder="e.g. LT-08" className="field mt-1.5" />
          </div>
        </div>
        <ModalActions onCancel={onClose} submitLabel="Add class" />
      </form>
    </Modal>
  );
}

// shrink the photo to 160x160 so it doesn't fill up local storage
function resizePhoto(file, done) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const size = 160;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      // crop to a square from the middle
      const scale = Math.max(size / img.width, size / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      canvas.getContext('2d').drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      done(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function EditProfile({ me, user, onClose }) {
  const [photo, setPhoto] = useState(user.img || '');
  const setEnd = useDB((d) => d.semEnd?.[me] || '');
  const lastExam = useDB((d) => (d.semEnd?.[me] ? '' : semesterEnd(d, me)));

  function pickPhoto(e) {
    const file = e.target.files[0];
    if (file) resizePhoto(file, setPhoto);
  }

  function submit(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = form.get('name').trim();
    update((db) => {
      const u = db.users.find((x) => x.id === me);
      u.nick = form.get('nick').trim();
      if (name) {
        u.name = name;
        u.initials = initialsOf(name);
      }
      u.dept = form.get('dept');
      u.sem = form.get('sem');
      u.img = photo;
      // empty means: use the date of the last exam
      db.semEnd = db.semEnd || {};
      if (form.get('semEnd')) db.semEnd[me] = form.get('semEnd');
      else delete db.semEnd[me];
    });
    onClose();
  }

  return (
    <Modal title="Edit profile" sub="Set a nickname or change your profile picture." onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="flex items-center gap-4">
          {photo ? <img src={photo} alt="preview" className="w-16 h-16 rounded-full object-cover" /> : <Avatar id={me} size={64} />}
          <div className="flex flex-wrap gap-2">
            <label className="btn px-3 py-2 rounded-xl border line text-[12.5px] font-bold cursor-pointer">
              Upload photo <input type="file" accept="image/*" className="hidden" onChange={pickPhoto} />
            </label>
            {photo && <button type="button" onClick={() => setPhoto('')} className="btn px-3 py-2 rounded-xl border line text-[12.5px] font-bold text-rose-600">Remove photo</button>}
          </div>
        </div>
        <div>
          <label className="lbl">NICKNAME (SHOWN ACROSS UNISYNC)</label>
          <input name="nick" maxLength={24} defaultValue={user.nick} placeholder="e.g. Abhi" className="field mt-1.5" />
        </div>
        <div>
          <label className="lbl">FULL NAME</label>
          <input name="name" required defaultValue={user.name} className="field mt-1.5" />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="lbl">COURSE</label>
            <select name="dept" defaultValue={DEPTS.includes(user.dept) ? user.dept : DEPTS[0]} className="field mt-1.5">
              {DEPTS.map((x) => <option key={x}>{x}</option>)}
            </select>
          </div>
          <div>
            <label className="lbl">SEMESTER</label>
            <select name="sem" defaultValue={SEMS.includes(user.sem) ? user.sem : SEMS[5]} className="field mt-1.5">
              {SEMS.map((x) => <option key={x}>{x}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="lbl">SEMESTER ENDS ON</label>
          <input name="semEnd" type="date" defaultValue={setEnd} className="field mt-1.5" />
          <p className="text-[11.5px] muted mt-1.5">
            Your feedback report is sent to you as a notification the day after this date.
            {setEnd ? '' : lastExam ? ` Left empty, it is sent after your last exam (${fmtDate(lastExam)}).` : ' Left empty, it is sent after your last exam.'}
          </p>
        </div>
        <ModalActions onCancel={onClose} submitLabel="Save changes" />
      </form>
    </Modal>
  );
}
