// top bar: logo, project picker (on the group page), page tabs,
// group chat button, notifications and the profile picture
import React, { useEffect, useRef, useState } from 'react';
import { Avatar, Logo, RichText, useNow } from '../common/ui';
import Icon from '../common/Icon';
import { useDB, userById, displayName } from '../../store/db';
import { daysTo, fmtShort } from '../../lib/format';
import { liveCall } from '../call/callActions';
import { reportReady } from '../../services/semesterReport';
import { DAYS, REMIND_AT, classesOn, tomorrow, clockOf, classTime, classPlace } from '../../lib/classes';

// builds the list of notifications for the bell
function getNotifications(d, me, now) {
  const list = [];
  const exams = d.exams[me] || [];
  const modules = d.modules[me] || [];

  // the semester is over: the feedback report is ready
  if (reportReady(d, me, now)) {
    const sem = userById(d, me).sem;
    list.push({ id: 'report' + sem, icon: 'pie', fg: '#4338ca', bg: '#e0e7ff', text: `Your **${sem} feedback report** is ready`, sub: 'Open it to see how you did and download the PDF', isReport: true });
  }

  // classes: the ones left today, and from the evening the ones tomorrow
  const classes = d.classes?.[me] || [];
  const time = clockOf(now);
  const today = new Date(now);
  classesOn(classes, today).filter((c) => (c.end || c.start) > time).forEach((c) => {
    list.push({ id: 'class' + c.id + today.toDateString(), icon: 'calendar', fg: '#0e7490', bg: '#cffafe', text: `Class today: **${c.title}** at ${c.start}`, sub: `${classTime(c)} · ${classPlace(c)}` });
  });
  if (time >= (d.remind?.[me] || REMIND_AT)) {
    const next = tomorrow(now);
    classesOn(classes, next).forEach((c) => {
      list.push({ id: 'class' + c.id + next.toDateString(), icon: 'calendar', fg: '#0e7490', bg: '#cffafe', text: `Class tomorrow: **${c.title}** at ${c.start}`, sub: `${DAYS[c.day]} · ${classTime(c)} · ${classPlace(c)}` });
    });
  }

  // exams in the next 10 days
  exams.forEach((e) => {
    const days = daysTo(e.date);
    if (days < 0 || days > 10) return;
    const when = days === 0 ? 'today' : days === 1 ? 'in 1 day' : `in ${days} days`;
    list.push({ id: 'exam' + e.id, icon: 'alert', fg: '#b91c1c', bg: '#fee2e2', text: `Upcoming exam: **${e.sub}** ${when}`, sub: `${fmtShort(e.date)} · ${e.time} · ${e.room}` });
  });

  // my own deadlines in the next 2 days
  (d.solo[me] || []).forEach((t) => {
    const days = daysTo(t.due);
    if (t.status === 'done' || days < 0 || days > 2) return;
    const when = days === 0 ? 'is due today' : days === 1 ? 'is due tomorrow' : 'is due in 2 days';
    const mod = modules.find((m) => m.id === t.mod);
    list.push({ id: 'solo' + t.id + t.due, icon: 'clock', fg: '#c2410c', bg: '#ffedd5', text: `Deadline alarm: **${t.title}** ${when}`, sub: `Individual · ${mod?.name || ''}` });
  });

  d.projects.filter((p) => p.members.includes(me)).forEach((p) => {
    // group tasks given to me that are due soon
    p.tasks.forEach((t) => {
      const days = daysTo(t.due);
      if (t.col === 'done' || t.assignee !== me || days > 2) return;
      const when = days < 0 ? 'is overdue' : days === 0 ? 'is due today' : 'is due soon';
      list.push({ id: 'task' + t.id + t.due, icon: 'flag', fg: '#4338ca', bg: '#e0e7ff', text: `Milestone: **${t.title}** ${when}`, sub: p.name });
    });

    // a call i'm not in yet
    const call = liveCall(d.calls[p.id]);
    if (call && !Object.values(call.participants).some((x) => x.userId === me)) {
      list.push({ id: 'call' + call.id, icon: 'video', fg: '#047857', bg: '#d1fae5', text: `**${displayName(userById(d, call.startedBy))}** started a video call`, sub: p.name, projectId: p.id, isCall: true });
    }
  });

  if (!exams.length) {
    list.push({ id: 'noexams', icon: 'upload', fg: '#4338ca', bg: '#e0e7ff', text: 'Upload your **exam routine** to enable automatic exam alarms', sub: 'Schedule page, Upload folders', goSchedule: true });
  }
  return list;
}

const TABS = [['personal', 'Individual'], ['team', 'Group'], ['schedule', 'Schedule']];

export default function Header({ me, view, setView, projId, setProjId, onUpload, openChat, chatCount, onJoinCall, onReport }) {
  const d = useDB();
  const myProjects = d.projects.filter((p) => p.members.includes(me));
  const project = d.projects.find((p) => p.id === projId);
  const now = useNow();
  const notifications = getNotifications(d, me, now);
  const [read, setRead] = useState([]);
  const [menu, setMenu] = useState(null); // 'projects', 'bell' or null
  const headerRef = useRef();
  const unread = notifications.filter((n) => !read.includes(n.id)).length;

  // close the open menu when clicking somewhere else
  useEffect(() => {
    const close = (e) => {
      if (!headerRef.current.contains(e.target)) setMenu(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  function clickNotification(n) {
    setRead([...read, n.id]);
    setMenu(null);
    if (n.isReport) onReport();
    else if (n.isCall) onJoinCall(n.projectId);
    else if (n.goSchedule) setView('schedule');
  }

  const tabs = (
    <nav className="flex p-1 rounded-xl" style={{ background: 'var(--soft2)' }}>
      {TABS.map(([key, label]) => (
        <button key={key} onClick={() => setView(key)}
          className={`btn flex-1 px-3 md:px-4 py-1.5 rounded-lg text-[13px] font-bold whitespace-nowrap ${view === key ? 'bg-white shadow text-indigo-700' : 'text-slate-500'}`}>
          {label}
        </button>
      ))}
    </nav>
  );

  return (
    <header ref={headerRef} className="sticky top-0 z-30 backdrop-blur bg-white/85 border-b line">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-16 flex items-center gap-2 sm:gap-3 min-w-0">
        <div className="hidden sm:block"><Logo size={36} /></div>
        <div className="sm:hidden"><Logo size={32} withText={false} /></div>

        {/* project picker */}
        {view === 'team' && project && (
          <div className="relative ml-1 sm:ml-3 min-w-0">
            <button onClick={() => setMenu(menu === 'projects' ? null : 'projects')}
              className="btn flex items-center gap-2 px-3 py-2 rounded-xl border line bg-white max-w-[150px] sm:max-w-[320px] lg:max-w-none">
              <span className="w-6 h-6 rounded-lg grad text-white grid place-items-center text-[11px] font-extrabold shrink-0">{project.name.slice(0, 2).toUpperCase()}</span>
              <span className="text-[13px] font-bold truncate">{project.name}</span>
              <Icon name="chevronDown" size={14} className="text-slate-400" />
            </button>

            {menu === 'projects' && (
              <div className="pop absolute left-0 mt-2 w-[min(300px,calc(100vw-32px))] card p-2 z-40">
                <div className="px-2.5 py-1.5 text-[11px] font-bold muted">YOUR GROUP PROJECTS</div>
                {myProjects.map((p) => {
                  const selected = p.id === projId;
                  return (
                    <button key={p.id} onClick={() => { setProjId(p.id); setMenu(null); }}
                      className={`w-full text-left px-2.5 py-2 rounded-xl hover:bg-slate-50 flex items-center gap-2.5 ${selected ? 'bg-indigo-50' : ''}`}>
                      <span className="w-7 h-7 rounded-lg text-white grid place-items-center text-[11px] font-extrabold shrink-0"
                        style={{ background: selected ? 'var(--brand)' : '#94a3b8' }}>
                        {p.name.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[13px] font-bold truncate">{p.name}</span>
                        <span className="block text-[11px] truncate muted">
                          {p.members.length} members · {p.tasks.length} tasks{liveCall(d.calls[p.id]) ? ' · live call' : ''}
                        </span>
                      </span>
                      {selected && <Icon name="check" size={16} className="ml-auto text-indigo-600" />}
                    </button>
                  );
                })}
                <div className="border-t line my-2" />
                <div className="px-2.5 py-1.5 text-[11.5px] muted leading-snug">Group projects are created from your group coursework files.</div>
                <button onClick={() => { setMenu(null); onUpload(); }} className="w-full text-left px-2.5 py-2 rounded-xl text-[13px] font-bold text-indigo-600 hover:bg-indigo-50 flex items-center gap-2">
                  <Icon name="upload" size={15} /> Upload coursework files
                </button>
              </div>
            )}
          </div>
        )}

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <div className="hidden md:block">{tabs}</div>

          {view === 'team' && project && (
            <button onClick={openChat} aria-label="Group chat" className="btn flex items-center gap-2 h-10 px-2.5 sm:px-3 rounded-xl border line bg-white text-[13px] font-bold">
              <Icon name="message" size={16} /> <span className="hidden lg:inline">Group Chat</span>
              {chatCount > 0 && <span className="badge hidden sm:inline-flex" style={{ background: '#e0e7ff', color: '#4338ca' }}>{chatCount}</span>}
            </button>
          )}

          {/* notifications */}
          <div className="relative">
            <button onClick={() => setMenu(menu === 'bell' ? null : 'bell')} aria-label="Notifications" className="btn relative w-10 h-10 rounded-xl border line bg-white grid place-items-center">
              <Icon name="bell" size={18} className="text-slate-600" />
              {unread > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[19px] h-[19px] px-1 rounded-full bg-rose-500 text-white text-[11px] font-extrabold grid place-items-center ring-2 ring-white">{unread}</span>
              )}
            </button>

            {menu === 'bell' && (
              <div className="pop fixed sm:absolute left-4 right-4 sm:left-auto top-[68px] sm:top-auto sm:right-0 sm:mt-2 sm:w-[380px] card p-0 z-40 overflow-hidden">
                <div className="flex items-center gap-2 p-4 border-b line">
                  <span className="w-2 h-2 rounded-full bg-rose-500 pulse" />
                  <span className="font-bold text-[14px]">Notifications</span>
                  <span className="badge ml-1" style={{ background: '#fee2e2', color: '#b91c1c' }}>{unread} new</span>
                  <button onClick={() => setRead(notifications.map((n) => n.id))} className="ml-auto text-[12px] font-bold text-indigo-600">Mark all read</button>
                </div>

                <div className="max-h-[340px] overflow-y-auto divide-y divide-slate-100">
                  {!notifications.length && <div className="p-6 text-center text-[13px] muted">You are all caught up.</div>}
                  {notifications.map((n) => {
                    const isNew = !read.includes(n.id);
                    return (
                      <button key={n.id} onClick={() => clickNotification(n)} className={`w-full text-left p-3.5 flex gap-3 hover:bg-slate-50 ${isNew ? '' : 'opacity-60'}`}>
                        <span className="w-8 h-8 rounded-xl grid place-items-center shrink-0" style={{ background: n.bg, color: n.fg }}><Icon name={n.icon} size={16} /></span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] leading-snug"><RichText text={n.text} /></div>
                          <div className="text-[11.5px] mt-0.5 muted">{n.sub}</div>
                        </div>
                        {n.isCall && <span className="badge self-center" style={{ background: '#059669', color: '#fff' }}>Join</span>}
                        {isNew && !n.isCall && <span className="w-2 h-2 rounded-full bg-indigo-500 mt-1.5 shrink-0" />}
                      </button>
                    );
                  })}
                </div>

                <button onClick={() => { setView('schedule'); setMenu(null); }} className="w-full p-3 text-[12.5px] font-bold text-indigo-600 border-t line hover:bg-slate-50">
                  <span className="inline-flex items-center gap-1.5">Manage schedule and alerts <Icon name="arrowRight" size={14} /></span>
                </button>
              </div>
            )}
          </div>

          <button onClick={() => setView('schedule')} title={displayName(userById(d, me))} className="btn rounded-full hover:ring-2 hover:ring-indigo-200">
            <Avatar id={me} size={34} />
          </button>
        </div>
      </div>

      {/* on small screens the tabs go under the top bar */}
      <div className="md:hidden px-4 pb-3">{tabs}</div>
    </header>
  );
}
