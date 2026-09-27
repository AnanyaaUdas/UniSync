// video call using webrtc. every person connects directly to every other person.
// to connect, the browsers need to swap some setup messages (offer, answer, ice).
// right now those messages go through a BroadcastChannel, which only works between
// tabs on the same computer. with the backend this will be a websocket instead.
import { useEffect, useRef, useState } from 'react';
import { uid } from '../../lib/format';
import { joinCall, leaveCall, stillHere, addEvent } from './callActions';

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

// if the student has no webcam, we send a picture of their initials instead
function initialsVideo(name, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const ctx = canvas.getContext('2d');

  const draw = () => {
    ctx.fillStyle = '#1e1b4b';
    ctx.fillRect(0, 0, 640, 360);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(320, 165, 70, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 54px sans-serif';
    ctx.fillText(name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase(), 320, 167);
    ctx.font = '600 20px sans-serif';
    ctx.fillText('No camera', 320, 280);
  };
  draw();
  // a canvas stream only sends frames when it's redrawn
  const timer = setInterval(draw, 1000);
  const track = canvas.captureStream(5).getVideoTracks()[0];
  track.addEventListener('ended', () => clearInterval(timer));
  track.isPlaceholder = true;
  return track;
}

// ask for camera and mic. if that fails try mic only, then nothing
async function getCameraAndMic(name, color) {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 360 }, audio: { echoCancellation: true, noiseSuppression: true } });
  } catch {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true } });
    } catch {
      stream = new MediaStream();
    }
  }
  const hasCam = stream.getVideoTracks().length > 0;
  const hasMic = stream.getAudioTracks().length > 0;
  if (!hasCam) stream.addTrack(initialsVideo(name, color));
  return { stream, hasCam, hasMic };
}

export default function useCall({ projectId, me, meName, meColor }) {
  const peerId = useRef(uid('peer-')).current; // id for this tab in the call
  const cam = useRef(null); // my camera + mic
  const screen = useRef(null); // my screen share, when sharing
  const connections = useRef({}); // other peerId -> RTCPeerConnection
  const waitingIce = useRef({}); // ice messages that came before the offer/answer
  const channel = useRef(null);
  const myMedia = useRef({ cam: true, mic: true, sharing: false });

  const [localStream, setLocalStream] = useState(null);
  const [remotes, setRemotes] = useState({}); // peerId -> { userId, stream, cam, mic, sharing }
  const [media, setMedia] = useState({ cam: true, mic: true, sharing: false, hasCam: false, hasMic: false });
  const [status, setStatus] = useState('starting');

  const send = (msg) => channel.current?.postMessage({ ...msg, from: peerId });

  const updateRemote = (id, changes) =>
    setRemotes((all) => ({ ...all, [id]: { ...all[id], ...changes } }));

  const removeRemote = (id) => {
    connections.current[id]?.close();
    delete connections.current[id];
    setRemotes((all) => {
      const copy = { ...all };
      delete copy[id];
      return copy;
    });
  };

  // tell everyone if my mic / camera / screen share is on
  const shareMyStatus = () => send({ type: 'media', userId: me, ...myMedia.current });

  function connectTo(id, userId) {
    if (connections.current[id]) return connections.current[id];
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    connections.current[id] = pc;

    cam.current.getAudioTracks().forEach((t) => pc.addTrack(t, cam.current));
    const video = screen.current || cam.current.getVideoTracks()[0];
    if (video) pc.addTrack(video, cam.current);

    pc.onicecandidate = (e) => e.candidate && send({ type: 'ice', to: id, cand: e.candidate.toJSON() });
    pc.ontrack = (e) => updateRemote(id, { userId, stream: e.streams[0] || new MediaStream([e.track]) });
    pc.onconnectionstatechange = () => {
      if (['failed', 'closed'].includes(pc.connectionState)) removeRemote(id);
    };
    updateRemote(id, { userId });
    return pc;
  }

  async function addWaitingIce(id) {
    for (const cand of waitingIce.current[id] || []) {
      await connections.current[id].addIceCandidate(cand).catch(() => {});
    }
    waitingIce.current[id] = [];
  }

  async function handleMessage(msg) {
    if (msg.from === peerId || (msg.to && msg.to !== peerId)) return;
    try {
      if (msg.type === 'join') {
        // people already in the call send the offer to the new person
        const pc = connectTo(msg.from, msg.userId);
        await pc.setLocalDescription(await pc.createOffer());
        send({ type: 'offer', to: msg.from, userId: me, sdp: pc.localDescription.toJSON() });
        shareMyStatus();
      } else if (msg.type === 'offer') {
        const pc = connectTo(msg.from, msg.userId);
        await pc.setRemoteDescription(msg.sdp);
        await addWaitingIce(msg.from);
        await pc.setLocalDescription(await pc.createAnswer());
        send({ type: 'answer', to: msg.from, userId: me, sdp: pc.localDescription.toJSON() });
        shareMyStatus();
      } else if (msg.type === 'answer') {
        const pc = connections.current[msg.from];
        if (pc?.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(msg.sdp);
          await addWaitingIce(msg.from);
        }
      } else if (msg.type === 'ice') {
        const pc = connections.current[msg.from];
        if (pc?.remoteDescription) await pc.addIceCandidate(msg.cand);
        else (waitingIce.current[msg.from] ||= []).push(msg.cand);
      } else if (msg.type === 'media') {
        updateRemote(msg.from, { userId: msg.userId, cam: msg.cam, mic: msg.mic, sharing: msg.sharing });
      } else if (msg.type === 'leave') {
        removeRemote(msg.from);
      }
    } catch (err) {
      console.warn('call error', err);
    }
  }

  // the channel is made once, so it calls the latest handleMessage through a ref
  const onMessage = useRef(handleMessage);
  onMessage.current = handleMessage;

  // join the call when the call screen opens
  useEffect(() => {
    let open = true;
    let timer;

    (async () => {
      const { stream, hasCam, hasMic } = await getCameraAndMic(meName, meColor);
      if (!open) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      cam.current = stream;
      myMedia.current = { cam: hasCam, mic: hasMic, sharing: false };
      setMedia({ ...myMedia.current, hasCam, hasMic });
      setLocalStream(stream);

      channel.current = new BroadcastChannel(`unisync-call-${projectId}`);
      channel.current.onmessage = (e) => onMessage.current(e.data);

      joinCall(projectId, me, peerId);
      send({ type: 'join', userId: me });
      setStatus('live');
      timer = setInterval(() => stillHere(projectId, peerId), 5000);
    })();

    // tab closed while in the call
    const onClose = () => {
      send({ type: 'leave' });
      leaveCall(projectId, me, peerId, true);
    };
    window.addEventListener('beforeunload', onClose);

    return () => {
      open = false;
      clearInterval(timer);
      window.removeEventListener('beforeunload', onClose);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function hangUp() {
    send({ type: 'leave' });
    Object.keys(connections.current).forEach(removeRemote);
    screen.current?.stop();
    cam.current?.getTracks().forEach((t) => t.stop());
    channel.current?.close();
    setStatus('ended');
    await leaveCall(projectId, me, peerId);
  }

  function changeMyMedia(changes) {
    myMedia.current = { ...myMedia.current, ...changes };
    setMedia((m) => ({ ...m, ...changes }));
    shareMyStatus();
  }

  function toggleMic() {
    const track = cam.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    changeMyMedia({ mic: track.enabled });
  }

  function toggleCam() {
    const track = cam.current?.getVideoTracks()[0];
    if (!track || track.isPlaceholder) return;
    track.enabled = !track.enabled;
    changeMyMedia({ cam: track.enabled });
  }

  // swap the video everyone receives (camera <-> screen) without reconnecting
  async function sendVideo(track) {
    const jobs = Object.values(connections.current).map((pc) => {
      const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
      return sender?.replaceTrack(track);
    });
    await Promise.all(jobs);
  }

  async function stopShare() {
    if (!screen.current) return;
    screen.current.onended = null;
    screen.current.stop();
    screen.current = null;
    await sendVideo(cam.current.getVideoTracks()[0]);
    setLocalStream(cam.current);
    changeMyMedia({ sharing: false });
    addEvent(projectId, me, 'screen', `${meName} stopped sharing their screen`);
  }

  async function startShare() {
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const track = display.getVideoTracks()[0];
      screen.current = track;
      track.onended = stopShare; // user pressed the browser's "stop sharing" button
      await sendVideo(track);
      setLocalStream(new MediaStream([track, ...cam.current.getAudioTracks()]));
      changeMyMedia({ sharing: true });
      addEvent(projectId, me, 'screen', `${meName} started sharing their screen`);
    } catch {
      // user cancelled the screen picker
    }
  }

  return { peerId, localStream, remotes, media, status, toggleMic, toggleCam, startShare, stopShare, hangUp };
}
