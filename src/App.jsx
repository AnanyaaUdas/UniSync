// main app. shows login first, then the setup (upload folders) page,
// then the dashboard with the individual, group and schedule pages
import React, { useEffect, useRef, useState } from 'react';
import AuthPage from './components/auth/AuthPage';
import Onboarding from './components/onboarding/Onboarding';
import Header from './components/layout/Header';
import PersonalView from './components/personal/PersonalView';
import TeamView from './components/team/TeamView';
import ProfileView from './components/profile/ProfileView';
import ChatDrawer from './components/chat/ChatDrawer';
import CallRoom from './components/call/CallRoom';
import ThemeToggle from './components/common/ThemeToggle';
import { Toasts, toast, clearToasts } from './components/common/ui';
import { useDB, useSession, userById, displayName } from './store/db';
import { setPresenceUser } from './store/presence';
import { liveCall } from './components/call/callActions';
import { firstName } from './lib/format';

export default function App() {
  const me = useSession();
  const user = useDB((d) => d.users.find((u) => u.id === me));

  useEffect(() => {
    setPresenceUser(me);
  }, [me]);

  let page = <Dashboard me={me} />;
  if (!user) page = <AuthPage />;
  else if (!user.onboarded) page = <Onboarding user={user} />;

  return (
    <>
      {page}
      <Toasts />
      <ThemeToggle />
    </>
  );
}

function Dashboard({ me }) {
  const d = useDB();
  const myProjects = d.projects.filter((p) => p.members.includes(me));
  const [view, setView] = useState('personal'); // personal, team or schedule
  const [projId, setProjId] = useState(myProjects[0]?.id || null);
  const [chatOpen, setChatOpen] = useState(false);
  const [callProj, setCallProj] = useState(null);
  const [uploading, setUploading] = useState(false);

  // pick the first project once some are made
  useEffect(() => {
    if (!projId && myProjects[0]) setProjId(myProjects[0].id);
  }, [myProjects.length]); // eslint-disable-line react-hooks/exhaustive-deps

  function openCall(id) {
    setProjId(id);
    setView('team');
    setChatOpen(false);
    setCallProj(id);
    clearToasts((t) => t.call);
  }

  function changeView(v) {
    setView(v);
    setChatOpen(false);
  }

  useTeammateToasts(me, openCall, (id) => {
    setProjId(id);
    setView('team');
  });

  const project = d.projects.find((p) => p.id === projId);
  const messageCount = project ? project.chat.filter((c) => !c.type).length : 0;

  return (
    <div className="min-h-screen">
      <Header me={me} view={view} setView={changeView} projId={projId} setProjId={setProjId}
        onUpload={() => setUploading(true)} openChat={() => setChatOpen(true)} chatCount={messageCount} onJoinCall={openCall} />

      {view === 'personal' && <PersonalView me={me} goSchedule={() => setView('schedule')} />}
      {/* the key makes react start fresh when the project changes */}
      {view === 'team' && <TeamView key={'team-' + projId} me={me} projId={projId} openChat={() => setChatOpen(true)} startCall={openCall} onUpload={() => setUploading(true)} />}
      {view === 'schedule' && <ProfileView me={me} onUpload={() => setUploading(true)} />}

      {chatOpen && view === 'team' && project && <ChatDrawer me={me} projectId={project.id} onClose={() => setChatOpen(false)} onCall={() => openCall(project.id)} />}
      {callProj && <CallRoom key={'call-' + callProj} projectId={callProj} me={me} onLeave={() => setCallProj(null)} />}
      {uploading && <Onboarding user={userById(d, me)} reimport onClose={() => setUploading(false)} />}
    </div>
  );
}

// shows a small popup when a group member (in another tab) does something,
// or when someone starts a call in one of my groups
function useTeammateToasts(me, openCall, openProject) {
  const d = useDB();
  const seenFeed = useRef(null);
  const seenCalls = useRef(new Set());

  useEffect(() => {
    const mine = d.projects.filter((p) => p.members.includes(me));

    // first time: just remember what is already there
    if (!seenFeed.current) {
      seenFeed.current = new Set(mine.flatMap((p) => p.feed.map((f) => f.id)));
      mine.forEach((p) => d.calls[p.id] && seenCalls.current.add(d.calls[p.id].id));
      return;
    }

    mine.forEach((p) => {
      p.feed.forEach((f) => {
        if (seenFeed.current.has(f.id)) return;
        seenFeed.current.add(f.id);
        const byOther = f.who !== me && Date.now() - f.at < 15000;
        if (byOther && !f.act.includes('video call')) {
          toast({
            who: f.who,
            title: p.name,
            text: `**${firstName(displayName(userById(d, f.who)))}** ${f.act}`,
            action: { label: 'View', run: () => openProject(p.id) },
          });
        }
      });

      const call = liveCall(d.calls[p.id]);
      if (call && !seenCalls.current.has(call.id)) {
        seenCalls.current.add(call.id);
        const imInIt = Object.values(call.participants).some((x) => x.userId === me);
        if (!imInIt && call.startedBy !== me) {
          toast({
            who: call.startedBy,
            title: `Incoming call · ${p.name}`,
            text: `**${displayName(userById(d, call.startedBy))}** started a video call`,
            ms: 15000,
            call: true,
            action: { label: 'Join', run: () => openCall(p.id) },
          });
        }
      }
    });
  }, [d, me]); // eslint-disable-line react-hooks/exhaustive-deps
}
