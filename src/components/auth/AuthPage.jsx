// login and sign up page. only islington college student emails are allowed
import React, { useState } from 'react';
import { ALLOWED_DOMAINS, DEPTS, SEMS, PALETTE, LMU_ID_RE } from '../../lib/constants';
import { useDB, update, setSession } from '../../store/db';
import { DEMO_PASSWORD } from '../../store/seed';
import { initialsOf, uid } from '../../lib/format';
import { Avatar, Logo } from '../common/ui';
import { api } from '../../services/api';
import Icon from '../common/Icon';

// the part before @ looks like NP01CP4A240001
// (NP + 2 digits + course code + id number)
const STUDENT_ID_RE = /^NP\d{2}[A-Z][A-Z0-9]{1,5}\d{5,8}$/;

// returns the email in the right case, or null if it is not a college email
function checkCollegeEmail(text) {
  const [local, domain, extra] = text.trim().split('@');
  if (!local || !domain || extra !== undefined) return null;
  if (!ALLOWED_DOMAINS.includes(domain.toLowerCase())) return null;
  if (!STUDENT_ID_RE.test(local.toUpperCase())) return null;
  return `${local.toUpperCase()}@${domain.toLowerCase()}`;
}

export default function AuthPage() {
  const [mode, setMode] = useState('login');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const users = useDB((d) => d.users);
  const demoUsers = users.filter((u) => u.password === DEMO_PASSWORD).slice(0, 5);
  const signup = mode === 'signup';

  async function submit(e) {
    e.preventDefault();
    setError('');
    const form = new FormData(e.currentTarget);
    const collegeEmail = checkCollegeEmail(email);
    if (!collegeEmail) return setError('Use your Islington College student email in the format NP01CP4A240001@islingtoncollege.edu.np');
    if (password.length < 6) return setError('Password must be at least 6 characters.');

    setBusy(true);
    try {
      if (signup) {
        const name = form.get('name').trim();
        const lmuId = form.get('lmuId').trim();
        if (users.some((u) => u.email === collegeEmail)) throw new Error('An account with this email already exists. Please log in instead.');
        if (!LMU_ID_RE.test(lmuId)) throw new Error('Enter your London Met ID (numbers only, e.g. 23048612).');
        if (users.some((u) => u.lmuId === lmuId)) throw new Error('This London Met ID is already registered.');

        const user = {
          id: uid('u'),
          name,
          initials: initialsOf(name),
          color: PALETTE[users.length % PALETTE.length],
          email: collegeEmail,
          dept: form.get('dept'),
          sem: form.get('sem'),
          lmuId,
          password,
          onboarded: false,
          nick: '',
          img: '',
        };
        await api.signup(user);
        update((db) => {
          db.users.push(user);
        });
        setSession(user.id);
      } else {
        const user = await api.login(collegeEmail, password, users);
        setSession(user.id);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const features = [
    ['shield', 'Verified college email access only'],
    ['scan', 'AI turns your module files into deadlines'],
    ['users', 'Group boards with a live activity feed'],
    ['video', 'Video calls, screen share and meeting minutes'],
  ];

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between p-12 grad text-white">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="" className="w-11 h-11 rounded-xl bg-white object-contain p-1.5" />
          <span className="font-extrabold text-xl tracking-tight">UniSync</span>
        </div>
        <div>
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight">One planner for your<br />coursework and your team.</h1>
          <p className="mt-4 text-white/80 text-[15px] max-w-md">Upload your module folder and exam routine, and UniSync's AI builds your modules, deadlines and exam alarms. Then plan with your group, chat, and meet on video with meeting minutes.</p>
          <div className="mt-8 space-y-3 text-[14px]">
            {features.map(([icon, text]) => (
              <div key={text} className="flex items-center gap-3"><span className="w-8 h-8 rounded-lg bg-white/15 grid place-items-center"><Icon name={icon} size={16} /></span>{text}</div>
            ))}
          </div>
        </div>
        <p className="text-white/60 text-[12px]">Islington College accounts only: @islingtoncollege.edu.np</p>
      </div>

      <div className="flex items-center justify-center p-5 sm:p-10">
        <div className="w-full max-w-[420px]">
          <div className="lg:hidden mb-7"><Logo size={40} /></div>
          <h2 className="text-2xl font-extrabold tracking-tight">{signup ? 'Create your student account' : 'Sign in to UniSync'}</h2>
          <p className="text-[13.5px] mt-1.5 muted">Use your official Islington College email.</p>

          <div className="flex p-1 rounded-xl my-5" style={{ background: 'var(--soft2)' }}>
            {[['login', 'Login'], ['signup', 'Sign up']].map(([key, label]) => (
              <button key={key} type="button" onClick={() => { setMode(key); setError(''); }}
                className={`btn flex-1 py-2 rounded-lg text-[13px] font-bold ${mode === key ? 'bg-white shadow text-indigo-700' : 'text-slate-500'}`}>{label}</button>
            ))}
          </div>

          <form key={mode} onSubmit={submit} className="space-y-3.5 card p-5">
            {signup && (
              <div><label className="lbl">FULL NAME</label><input name="name" required placeholder="e.g. Abhishek Rao" className="field mt-1.5" /></div>
            )}
            <div><label className="lbl">STUDENT EMAIL</label>
              <input name="email" required autoComplete="username" placeholder="NP01CP4A240001@islingtoncollege.edu.np" className="field mt-1.5"
                value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            {signup && (
              <>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div><label className="lbl">COURSE</label><select name="dept" className="field mt-1.5">{DEPTS.map((d) => <option key={d}>{d}</option>)}</select></div>
                  <div><label className="lbl">SEMESTER</label><select name="sem" defaultValue={SEMS[5]} className="field mt-1.5">{SEMS.map((s) => <option key={s}>{s}</option>)}</select></div>
                </div>
                <div><label className="lbl">LONDON MET ID</label>
                  <input name="lmuId" required inputMode="numeric" pattern="[0-9]{7,9}" maxLength={9} placeholder="e.g. 23048612" className="field mt-1.5" /></div>
              </>
            )}
            <div><label className="lbl">PASSWORD</label>
              <input name="pw" type="password" required autoComplete={signup ? 'new-password' : 'current-password'} className="field mt-1.5"
                value={password} onChange={(e) => setPassword(e.target.value)} /></div>
            {error && <div className="fade p-3 rounded-xl text-[12.5px] font-semibold" style={{ background: '#fee2e2', color: '#b91c1c' }}><span className="flex gap-2"><Icon name="alert" size={16} className="mt-px" />{error}</span></div>}
            <button disabled={busy} className="btn w-full py-3 rounded-xl grad text-white font-bold text-[14px] disabled:opacity-60">
              {busy ? 'Please wait…' : signup ? 'Create account' : 'Sign in'}
            </button>
            <p className="text-[11.5px] text-center muted">Format: <b>NP01CP4A240001@islingtoncollege.edu.np</b></p>
          </form>

          {/* demo accounts: click a name to fill the form */}
          {!signup && demoUsers.length > 0 && (
            <div className="mt-5">
              <div className="lbl mb-2">DEMO ACCOUNTS · PASSWORD {DEMO_PASSWORD}</div>
              <div className="flex flex-wrap gap-2">
                {demoUsers.map((u) => (
                  <button key={u.id} type="button" onClick={() => { setEmail(u.email); setPassword(DEMO_PASSWORD); }}
                    className="btn flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-xl border line bg-white text-[12.5px] font-bold">
                    <Avatar id={u.id} size={22} ring={false} /> {u.name.split(' ')[0]}
                  </button>
                ))}
              </div>
              <p className="text-[11.5px] muted mt-2">Tip: open a second browser tab and sign in as another student to see live activity, chat and video calls sync between them.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
