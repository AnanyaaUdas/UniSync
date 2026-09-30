// setup page after signing up (also opens again from "upload folders").
// step 1: modules folder, step 2: class timetable, step 3: exam folder,
// step 4: read the files, step 5: the student checks everything before it is saved
import React, { useState } from 'react';
import FolderDrop from '../common/FolderDrop';
import Icon from '../common/Icon';
import { Logo } from '../common/ui';
import { api } from '../../services/api';
import { update, logPersonal, setSession } from '../../store/db';
import { DEADLINE_KINDS, PALETTE } from '../../lib/constants';
import { uid, fmtDate, daysTo, dayFromNow } from '../../lib/format';
import { applyTeamProjects } from '../../services/projectGenerator';
import { DAYS, REMIND_AT } from '../../lib/classes';

const STEPS = ['Modules folder', 'Class timetable', 'Exam schedule', 'AI analysis', 'Review'];

// "1 file" / "3 files"
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const newModule = (code, name, count) => ({
  id: uid('m-'),
  code,
  name,
  color: PALETTE[count % PALETTE.length],
  files: [],
  source: 'ai-exam',
});

export default function Onboarding({ user, reimport = false, onClose }) {
  const [step, setStep] = useState(0);
  const [moduleFiles, setModuleFiles] = useState([]);
  const [timetableFiles, setTimetableFiles] = useState([]);
  const [examFiles, setExamFiles] = useState([]);
  const [log, setLog] = useState([]);
  const [percent, setPercent] = useState(0);
  const [result, setResult] = useState(null); // { modules, deadlines, exams, classes, warnings }
  const [error, setError] = useState('');

  const addLog = (icon, text) => setLog((old) => [...old, { id: uid('log'), icon, text }]);

  async function readFiles() {
    setStep(3);
    setLog([]);
    setPercent(0);
    setError('');
    const total = moduleFiles.length + timetableFiles.length + examFiles.length || 1;

    try {
      // 1. module files
      let mod = { modules: [], deadlines: [], warnings: [] };
      if (moduleFiles.length) {
        addLog('scan', `Reading ${plural(moduleFiles.length, 'module file')}…`);
        mod = await api.parseModules(moduleFiles, (i, name) => {
          addLog('file', `Reading ${name}`);
          setPercent(Math.round((i / total) * 100));
        });
      }
      mod.modules.forEach((m) => addLog('book', `Module found: ${m.code} · ${m.name}`));
      addLog('clock', `${plural(mod.deadlines.length, 'deadline')} found`);

      // 2. class timetable
      let tt = { classes: [], warnings: [] };
      if (timetableFiles.length) {
        addLog('scan', `Reading class timetable (${plural(timetableFiles.length, 'file')})…`);
        tt = await api.parseTimetable(timetableFiles, (i, name) => {
          addLog('calendar', `Reading ${name}`);
          setPercent(Math.round(((moduleFiles.length + i) / total) * 100));
        }, mod.modules);
        addLog('clock', `${tt.classes.length} ${tt.classes.length === 1 ? 'class' : 'classes'} a week found`);
      }

      // 3. exam files
      let ex = { exams: [], deadlines: [], warnings: [] };
      if (examFiles.length) {
        addLog('scan', `Reading exam routine (${plural(examFiles.length, 'file')})…`);
        ex = await api.parseExams(examFiles, (i, name) => {
          addLog('calendar', `Reading ${name}`);
          setPercent(Math.round(((moduleFiles.length + timetableFiles.length + i) / total) * 100));
        }, mod.modules);
        addLog('cap', `${plural(ex.exams.length, 'exam')} found`);
        if (ex.deadlines.length) addLog('clock', `${plural(ex.deadlines.length, 'coursework date')} found in the routine`);
      }

      // an exam for a subject we don't have yet becomes a new module
      const modules = [...mod.modules];
      ex.exams.forEach((e) => {
        const have = modules.some((m) => (e.code && m.code === e.code) || m.name.toLowerCase() === e.sub.toLowerCase());
        if (have) return;
        modules.push(newModule(e.code || e.sub.slice(0, 6).toUpperCase().replace(/\s/g, ''), e.sub, modules.length));
        addLog('book', `Module added from exam routine: ${e.sub}`);
      });

      // coursework dates from the routine go under their module (make it if needed)
      const fromRoutine = ex.deadlines.map((dl) => {
        const code = dl.modHint?.code;
        let m = modules.find((x) => x.id === dl.mod) || modules.find((x) => code && x.code === code);
        if (!m && code) {
          m = newModule(code, dl.modHint.name || code, modules.length);
          modules.push(m);
        }
        return { ...dl, mod: m?.id || modules[0]?.id };
      });

      // skip dates that were already in the module files
      const isRepeat = (dl) => mod.deadlines.some((x) => x.due === dl.due && x.title.toLowerCase() === dl.title.toLowerCase());
      const deadlines = [...mod.deadlines, ...fromRoutine.filter((dl) => !isRepeat(dl))];

      const groupCount = deadlines.filter((x) => x.mode === 'team').length;
      addLog('users', `${plural(groupCount, 'group coursework item')} will become group projects, ${deadlines.length - groupCount} go to your individual board`);
      addLog('checkCircle', 'Done. Please check what was found.');
      setPercent(100);

      setResult({ modules, deadlines, exams: ex.exams, classes: tt.classes, warnings: [...mod.warnings, ...tt.warnings, ...ex.warnings] });
      setTimeout(() => setStep(4), 700);
    } catch (e) {
      console.error(e);
      setError(e.message || 'Could not read these files.');
    }
  }

  // save everything the student kept
  function save() {
    update((db) => {
      const me = user.id;
      db.users.find((u) => u.id === me).onboarded = true;

      // add new modules. if the code already exists, use the old one
      const modules = [...(db.modules[me] || [])];
      const sameAs = {}; // new module id -> saved module id
      result.modules.forEach((m) => {
        const old = modules.find((x) => x.code === m.code);
        if (old) {
          sameAs[m.id] = old.id;
        } else {
          modules.push(m);
          sameAs[m.id] = m.id;
        }
      });
      db.modules[me] = modules;
      const moduleOf = (id) => modules.find((m) => m.id === (sameAs[id] || id)) || {};

      const kept = result.deadlines.filter((x) => x.keep);

      // individual work goes to my own board
      const tasks = kept.filter((x) => x.mode !== 'team').map((x) => ({
        id: uid('s'),
        mod: sameAs[x.mod] || x.mod,
        title: x.title,
        due: x.due,
        kind: x.kind,
        status: x.status || (daysTo(x.due) < 0 ? 'done' : 'todo'),
        source: x.source || 'ai',
      }));
      db.solo[me] = [...tasks, ...(db.solo[me] || [])];

      // group work makes a group project (or joins one a classmate already made)
      const team = applyTeamProjects(db, me, kept.filter((x) => x.mode === 'team').map((x) => ({
        title: x.title,
        due: x.due,
        kind: x.kind,
        groupSize: x.groupSize,
        source: x.source,
        module: { code: moduleOf(x.mod).code || '', name: moduleOf(x.mod).name || '' },
      })));
      const projectCount = team.created + team.joined;

      const exams = result.exams.filter((x) => x.keep).map((e) => ({ ...e, keep: undefined }));
      db.exams[me] = [...(db.exams[me] || []), ...exams].sort((a, b) => (a.date < b.date ? -1 : 1));

      // weekly classes. a class on the same day and time is not added twice
      db.classes = db.classes || {};
      const saved = db.classes[me] || [];
      const fresh = (result.classes || [])
        .filter((c) => c.keep && c.title.trim() && !saved.some((x) => x.day === c.day && x.start === c.start && x.title.toLowerCase() === c.title.toLowerCase()))
        .map((c) => ({ ...c, keep: undefined, day: Number(c.day) }));
      db.classes[me] = [...saved, ...fresh];

      // keep a list of the uploaded files for the schedule page
      db.docs[me] = db.docs[me] || [];
      const uploaded = [...moduleFiles.map((f) => [f, 'Module']), ...timetableFiles.map((f) => [f, 'Class timetable']), ...examFiles.map((f) => [f, 'Exam schedule'])];
      uploaded.forEach(([f, kind]) => {
        db.docs[me].unshift({ id: uid('doc'), name: f.webkitRelativePath || f.name, size: (f.size / 1024 / 1024).toFixed(2) + ' MB', at: Date.now(), kind });
      });

      const what = `**${result.modules.length} modules**, **${tasks.length} individual deadlines**, **${projectCount} group projects**, **${fresh.length} weekly classes** and **${exams.length} exams**`;
      logPersonal(db, me, `imported ${what}`);
    });
    if (onClose) onClose();
  }

  return (
    <div className={reimport ? 'fixed inset-0 z-[70] bg-[var(--bg)] overflow-y-auto' : 'min-h-screen'}>
      <header className="border-b line bg-white/85 backdrop-blur sticky top-0 z-10">
        <div className="max-w-[980px] mx-auto px-4 sm:px-6 h-16 flex items-center gap-3">
          <Logo size={34} />
          <div className="ml-auto">
            {reimport
              ? <button onClick={onClose} className="btn px-3 py-2 rounded-xl border line bg-white text-[12.5px] font-bold">Cancel</button>
              : <button onClick={() => setSession(null)} className="btn px-3 py-2 rounded-xl border line bg-white text-[12.5px] font-bold">Log out</button>}
          </div>
        </div>
      </header>

      <main className="max-w-[980px] mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <div className="text-[12px] font-bold text-indigo-600">{reimport ? 'RE-IMPORT' : `WELCOME, ${user.name.split(' ')[0].toUpperCase()}`}</div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mt-1">{reimport ? 'Add more files' : "Let's set up your semester"}</h1>
          <p className="text-[14px] mt-1 muted">{reimport
            ? 'Upload only what is new: module files, your class timetable or your exam schedule. Skip the steps you do not need (or click a step above to jump to it). What you already have is kept.'
            : "Upload your modules folder, class timetable and exam schedule. UniSync reads them and builds your modules, deadlines, class reminders and exam alarms. You check everything before it's saved."}</p>
        </div>

        <ol className="grid grid-cols-5 gap-2 mb-6">
          {STEPS.map((name, i) => (
            <li key={name} onClick={() => reimport && i < 3 && step < 3 && setStep(i)}
              className={`flex flex-col gap-1.5 ${reimport && i < 3 && step < 3 ? 'cursor-pointer' : ''}`}>
              <div className={`h-1.5 rounded-full ${i <= step ? 'grad' : ''}`} style={i <= step ? {} : { background: 'var(--track)' }} />
              <div className={`text-[11.5px] font-bold ${i === step ? 'text-indigo-700' : 'muted'}`}><span className="hidden sm:inline">{i + 1}. </span>{name}</div>
            </li>
          ))}
        </ol>

        {step === 0 && (
          <div className="fade space-y-4">
            <FolderDrop icon="book" title="Upload your modules folder"
              desc="The folder with your module outlines, syllabi, assignment briefs and coursework specs. One sub folder per module works best, e.g. Modules/CS3040 Software Engineering/brief.pdf"
              files={moduleFiles} onFiles={setModuleFiles} />
            <div className="flex flex-wrap gap-2 justify-between items-center">
              {/* when adding files later you can skip the parts you already have */}
              {reimport
                ? <button onClick={() => setStep(1)} className="btn px-4 py-2.5 rounded-xl border line bg-white text-[13px] font-bold">Skip, no new module files</button>
                : <span />}
              <button disabled={!moduleFiles.length} onClick={() => setStep(1)} className="btn px-5 py-2.5 rounded-xl grad text-white text-[13px] font-bold disabled:opacity-50 inline-flex items-center gap-2">
                Continue <Icon name="arrowRight" size={16} />
              </button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="fade space-y-4">
            <FolderDrop icon="clock" title="Upload your class timetable"
              desc={`Your weekly class routine. The day, time, module and room of every class is picked out, and at ${REMIND_AT} each evening UniSync reminds you of the classes you have the next day.`}
              files={timetableFiles} onFiles={setTimetableFiles} images />
            <div className="flex flex-wrap gap-2 justify-between">
              <button onClick={() => setStep(0)} className="btn px-4 py-2.5 rounded-xl border line bg-white text-[13px] font-bold inline-flex items-center gap-2">
                <Icon name="arrowLeft" size={16} /> Back
              </button>
              <div className="flex gap-2">
                {!timetableFiles.length && <button onClick={() => setStep(2)} className="btn px-4 py-2.5 rounded-xl border line bg-white text-[13px] font-bold">{reimport ? 'Skip, no new timetable' : "I don't have it yet"}</button>}
                <button disabled={!timetableFiles.length} onClick={() => setStep(2)} className="btn px-5 py-2.5 rounded-xl grad text-white text-[13px] font-bold disabled:opacity-50 inline-flex items-center gap-2">
                  Continue <Icon name="arrowRight" size={16} />
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="fade space-y-4">
            <FolderDrop icon="calendar" title="Upload your exam schedule folder"
              desc="Your exam routine or timetable files (term, mid-term or final). Each subject, date, time and room is picked out."
              files={examFiles} onFiles={setExamFiles} images />
            <div className="flex flex-wrap gap-2 justify-between">
              <button onClick={() => setStep(1)} className="btn px-4 py-2.5 rounded-xl border line bg-white text-[13px] font-bold inline-flex items-center gap-2">
                <Icon name="arrowLeft" size={16} /> Back
              </button>
              <div className="flex gap-2">
                {!examFiles.length && (moduleFiles.length > 0 || timetableFiles.length > 0 || !reimport) && <button onClick={readFiles} className="btn px-4 py-2.5 rounded-xl border line bg-white text-[13px] font-bold">{reimport ? 'Skip, no new exam files' : "I don't have it yet"}</button>}
                <button disabled={!examFiles.length} onClick={readFiles} className="btn px-5 py-2.5 rounded-xl grad text-white text-[13px] font-bold disabled:opacity-50 inline-flex items-center gap-2">
                  <Icon name="scan" size={16} /> Analyse files
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="fade card p-6">
            <div className="flex items-center gap-3 mb-4">
              {error ? <Icon name="alert" size={30} className="text-rose-600" /> : <span className="w-9 h-9 rounded-full border-[3px] border-indigo-200 border-t-indigo-600 spin" />}
              <div className="flex-1">
                <div className="font-extrabold">{error ? 'Something went wrong' : 'Analysing your files'}</div>
                <div className="text-[12.5px] muted">{error || `Reading your files · ${percent}%`}</div>
              </div>
            </div>
            <div className="h-2 rounded-full mb-4" style={{ background: 'var(--soft2)' }}>
              <div className="h-2 rounded-full grad transition-all" style={{ width: percent + '%' }} />
            </div>
            <div className="max-h-[320px] overflow-y-auto space-y-1.5 text-[13px]">
              {log.map((l) => (
                <div key={l.id} className="fade flex items-center gap-2"><Icon name={l.icon} size={15} className="text-indigo-500" /><span>{l.text}</span></div>
              ))}
            </div>
            {error && (
              <button onClick={() => setStep(0)} className="btn mt-4 px-4 py-2.5 rounded-xl border line text-[13px] font-bold inline-flex items-center gap-2">
                <Icon name="arrowLeft" size={16} /> Try again
              </button>
            )}
          </div>
        )}

        {step === 4 && result && <Review result={result} setResult={setResult} onBack={() => setStep(2)} onConfirm={save} />}
      </main>
    </div>
  );
}

// last step: the student can fix names, dates, untick things and
// switch an item between individual and group before saving
function Review({ result, setResult, onBack, onConfirm }) {
  const { modules, deadlines, exams, warnings } = result;
  const classes = result.classes || [];
  const setList = (key, list) => setResult({ ...result, [key]: list });
  const editItem = (key, id, change) => setList(key, result[key].map((x) => (x.id === id ? { ...x, ...change } : x)));
  const keptCount = deadlines.filter((d) => d.keep).length;
  const groupCount = deadlines.filter((d) => d.keep && d.mode === 'team').length;

  function addModule() {
    setList('modules', [...modules, { id: uid('m-'), code: 'NEW', name: 'New module', color: PALETTE[modules.length % PALETTE.length], files: [], source: 'manual' }]);
  }

  function addDeadline() {
    const item = { id: uid('d-'), mod: modules[0]?.id, title: 'New deadline', due: dayFromNow(24 * 7), kind: 'assignment', confidence: 'manual', keep: true, mode: 'personal', modeReason: 'Added by you' };
    setList('deadlines', [item, ...deadlines]);
  }

  function addClass() {
    const item = { id: uid('k-'), day: 0, start: '08:00', end: '09:30', title: modules[0]?.name || 'Class', code: modules[0]?.code || '', type: 'Lecture', room: 'TBA', keep: true };
    setList('classes', [...classes, item]);
  }

  function addExam() {
    const item = { id: uid('e-'), sub: modules[0]?.name || 'Subject', code: modules[0]?.code || '', date: dayFromNow(24 * 30), time: '09:00 to 12:00', room: 'TBA', keep: true };
    setList('exams', [...exams, item]);
  }

  return (
    <div className="fade space-y-5">
      {warnings.length > 0 && (
        <div className="card p-4" style={{ background: '#fffbeb', borderColor: '#fde68a' }}>
          <div className="font-bold text-[13.5px] mb-1 flex items-center gap-2"><Icon name="alert" size={16} className="text-amber-600" /> Needs your attention</div>
          {warnings.map((w, i) => <div key={i} className="text-[12.5px]" style={{ color: '#92400e' }}>• {w}</div>)}
        </div>
      )}

      <section className="card p-5">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="font-extrabold">Modules</h2>
          <span className="badge" style={{ background: '#e0e7ff', color: '#4338ca' }}>{modules.length}</span>
          <button onClick={addModule} className="ml-auto text-[12.5px] font-bold text-indigo-600">+ Add module</button>
        </div>
        {!modules.length && <p className="text-[13px] muted">No modules found. Add them yourself.</p>}
        <div className="grid sm:grid-cols-2 gap-2.5">
          {modules.map((m) => (
            <div key={m.id} className="flex items-center gap-2 p-2.5 rounded-xl border line">
              <span className="w-2.5 h-9 rounded-full shrink-0" style={{ background: m.color }} />
              <input value={m.code} onChange={(e) => editItem('modules', m.id, { code: e.target.value.toUpperCase() })} className="field field-sm !w-[92px] font-bold" aria-label="Module code" />
              <input value={m.name} onChange={(e) => editItem('modules', m.id, { name: e.target.value })} className="field field-sm flex-1 min-w-0" aria-label="Module name" />
              <select value={m.duration || 'semester'} onChange={(e) => editItem('modules', m.id, { duration: e.target.value })} className="field field-sm !w-[118px] shrink-0" aria-label="How long the module runs">
                <option value="semester">1 semester</option>
                <option value="year">Year long</option>
              </select>
              <button onClick={() => setList('modules', modules.filter((x) => x.id !== m.id))} className="text-slate-300 hover:text-rose-500 p-1" title="Remove"><Icon name="x" size={16} /></button>
            </div>
          ))}
        </div>
      </section>

      <section className="card p-5">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <h2 className="font-extrabold">Coursework & deadlines</h2>
          <span className="badge" style={{ background: '#e0e7ff', color: '#4338ca' }}>{keptCount} of {deadlines.length} selected</span>
          <span className="badge" style={{ background: '#d1fae5', color: '#047857' }}><Icon name="users" size={12} /> {plural(groupCount, 'group project')}</span>
          <button disabled={!modules.length} onClick={addDeadline} className="ml-auto text-[12.5px] font-bold text-indigo-600 disabled:opacity-40">+ Add deadline</button>
        </div>
        {!deadlines.length && <p className="text-[13px] muted">No coursework or deadlines were found in the files. You can add them here or later from your board.</p>}
        <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
          {deadlines.map((d) => (
            <div key={d.id} className={`grid grid-cols-[auto_1fr] sm:grid-cols-[auto_1.6fr_1fr_130px_120px] gap-2 items-center p-2.5 rounded-xl border line ${d.keep ? '' : 'opacity-45'}`}>
              <input type="checkbox" checked={d.keep} onChange={(e) => editItem('deadlines', d.id, { keep: e.target.checked })} className="w-4 h-4 accent-indigo-600" />
              <input value={d.title} onChange={(e) => editItem('deadlines', d.id, { title: e.target.value })} className="field field-sm" aria-label="Title" />
              <select value={d.mod} onChange={(e) => editItem('deadlines', d.id, { mod: e.target.value })} className="field field-sm col-start-2 sm:col-start-auto">
                {modules.map((m) => <option key={m.id} value={m.id}>{m.code} · {m.name}</option>)}
              </select>
              <input type="date" value={d.due} onChange={(e) => editItem('deadlines', d.id, { due: e.target.value, dateNote: '' })} className="field field-sm col-start-2 sm:col-start-auto" />
              <select value={d.kind} onChange={(e) => editItem('deadlines', d.id, { kind: e.target.value })} className="field field-sm col-start-2 sm:col-start-auto">
                {Object.entries(DEADLINE_KINDS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>

              {/* individual or group switch */}
              <div className="col-start-2 sm:col-span-4 flex flex-wrap items-center gap-2 -mt-0.5">
                <div className="flex p-0.5 rounded-lg" style={{ background: 'var(--soft2)' }}>
                  {[['personal', 'Individual', 'user'], ['team', 'Group project', 'users']].map(([mode, label, icon]) => {
                    const on = (d.mode || 'personal') === mode;
                    const color = mode === 'team' ? 'text-emerald-700' : 'text-indigo-700';
                    return (
                      <button type="button" key={mode} onClick={() => editItem('deadlines', d.id, { mode, modeReason: 'Changed by you' })}
                        className={`px-2.5 py-1 rounded-md text-[11.5px] font-bold inline-flex items-center gap-1 ${on ? 'bg-white shadow ' + color : 'text-slate-500'}`}>
                        <Icon name={icon} size={12} /> {label}
                      </button>
                    );
                  })}
                </div>
                {d.mode === 'team' && d.groupSize && <span className="badge" style={{ background: '#d1fae5', color: '#047857' }}>groups of {d.groupSize}</span>}
                <span className="text-[11px] muted">
                  {d.modeReason || 'Treated as individual work'}
                  {d.source && d.confidence !== 'manual' ? ` · from ${d.source}` : ''}
                  {modules.some((m) => m.id === d.mod) ? '' : ' · pick a module'}
                </span>
                {d.dateNote && <span className="text-[11px] font-semibold w-full" style={{ color: '#b45309' }}>{d.dateNote}</span>}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card p-5">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="font-extrabold">Class timetable</h2>
          <span className="badge" style={{ background: '#e0e7ff', color: '#4338ca' }}>{classes.filter((c) => c.keep).length} a week</span>
          <button onClick={addClass} className="ml-auto text-[12.5px] font-bold text-indigo-600">+ Add class</button>
        </div>
        {!classes.length && <p className="text-[13px] muted">No classes yet. Add them here, or upload your timetable later from the Schedule page.</p>}
        <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
          {classes.map((c) => (
            <div key={c.id} className={`grid grid-cols-[auto_1fr] sm:grid-cols-[auto_1.5fr_120px_96px_96px_1fr] gap-2 items-center p-2.5 rounded-xl border line ${c.keep ? '' : 'opacity-45'}`}>
              <input type="checkbox" checked={c.keep} onChange={(e) => editItem('classes', c.id, { keep: e.target.checked })} className="w-4 h-4 accent-indigo-600" />
              <input value={c.title} onChange={(e) => editItem('classes', c.id, { title: e.target.value })} className="field field-sm" aria-label="Module" />
              <select value={c.day} onChange={(e) => editItem('classes', c.id, { day: Number(e.target.value) })} className="field field-sm col-start-2 sm:col-start-auto" aria-label="Day">
                {DAYS.map((name, i) => <option key={name} value={i}>{name}</option>)}
              </select>
              <input type="time" value={c.start} onChange={(e) => editItem('classes', c.id, { start: e.target.value })} className="field field-sm col-start-2 sm:col-start-auto" aria-label="Starts" />
              <input type="time" value={c.end} onChange={(e) => editItem('classes', c.id, { end: e.target.value })} className="field field-sm col-start-2 sm:col-start-auto" aria-label="Ends" />
              <input value={c.room} onChange={(e) => editItem('classes', c.id, { room: e.target.value })} className="field field-sm col-start-2 sm:col-start-auto" aria-label="Room" placeholder="Room" />
            </div>
          ))}
        </div>
        {classes.length > 0 && <p className="text-[11.5px] muted mt-2">At {REMIND_AT} each evening you get a reminder of the classes you have the next day, with the time and the room.</p>}
      </section>

      <section className="card p-5">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="font-extrabold">Exams</h2>
          <span className="badge" style={{ background: '#fee2e2', color: '#b91c1c' }}>{exams.filter((e) => e.keep).length}</span>
          <button onClick={addExam} className="ml-auto text-[12.5px] font-bold text-indigo-600">+ Add exam</button>
        </div>
        {!exams.length && <p className="text-[13px] muted">No exams yet. Upload your routine later from the Schedule page, or add them here.</p>}
        <div className="space-y-2">
          {exams.map((e) => (
            <div key={e.id} className={`grid grid-cols-[auto_1fr] sm:grid-cols-[auto_1.5fr_140px_1fr_90px] gap-2 items-center p-2.5 rounded-xl border line ${e.keep ? '' : 'opacity-45'}`}>
              <input type="checkbox" checked={e.keep} onChange={(ev) => editItem('exams', e.id, { keep: ev.target.checked })} className="w-4 h-4 accent-indigo-600" />
              <input value={e.sub} onChange={(ev) => editItem('exams', e.id, { sub: ev.target.value })} className="field field-sm" aria-label="Subject" />
              <input type="date" value={e.date} onChange={(ev) => editItem('exams', e.id, { date: ev.target.value })} className="field field-sm col-start-2 sm:col-start-auto" />
              <input value={e.time} onChange={(ev) => editItem('exams', e.id, { time: ev.target.value })} className="field field-sm col-start-2 sm:col-start-auto" aria-label="Time" />
              <input value={e.room} onChange={(ev) => editItem('exams', e.id, { room: ev.target.value })} className="field field-sm col-start-2 sm:col-start-auto" aria-label="Room" />
            </div>
          ))}
        </div>
        {exams.length > 0 && <p className="text-[11.5px] muted mt-2">Earliest exam: {fmtDate(exams[0].date)}. Alarms show 10 days before each exam.</p>}
      </section>

      {/* save bar stays at the bottom of the screen */}
      <div className="onboard-bar z-20 flex flex-nowrap gap-2 justify-between sticky bottom-0 -mx-4 sm:mx-0 px-4 py-3 sm:rounded-2xl bg-white/90 backdrop-blur border-t sm:border line">
        <button onClick={onBack} aria-label="Back" className="btn shrink-0 px-4 py-3 rounded-xl border line bg-white text-[13px] font-bold inline-flex items-center gap-2">
          <Icon name="arrowLeft" size={16} /> <span className="hidden sm:inline">Back</span>
        </button>
        <button onClick={onConfirm} className="btn flex-1 sm:flex-none justify-center px-5 sm:px-6 py-3 rounded-xl grad text-white text-[14px] font-bold shadow-lg inline-flex items-center gap-2">
          <span className="sm:hidden">Confirm</span><span className="hidden sm:inline">Confirm and open my dashboard</span> <Icon name="arrowRight" size={16} />
        </button>
      </div>
    </div>
  );
}
