// makes the meeting minutes or meeting log at the end of a call.
// it uses what was said in the call (transcript), notes people typed,
// and events like joining, leaving and screen sharing.
// minutes = summary, decisions, action items. log = everything in time order.
import { clock, duration } from '../lib/format';

// common words we skip when picking the important sentences
const SKIP = new Set('a an the and or but if then so to of in on at for with from by is are was were be been being i you he she it we they me my our your their this that these those just like um uh okay ok yeah yes no not do does did have has had will would can could should shall may might must there here what when where who how why all any some very really also about into over than too get got going go let lets gonna one two'.split(' '));

const DECISION = /\b(decided|decide|agree[ds]?|agreed|let'?s go with|we('ll| will) go with|finali[sz]e[d]?|approved?|settled on|conclusion|final decision|go ahead with)\b/i;
const ACTION = /\b(i('ll| will| am going to| need to)|you('ll| will| need to)|we('ll| will| need to| should| must)|needs? to|should|must|have to|has to|going to|to-?do|action item|take care of|responsible for|assign(ed)?)\b/i;
const WHEN = /\b(today|tonight|tomorrow|by (monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week|end of (the )?(day|week))|(on|this|next) (monday|tuesday|wednesday|thursday|friday|saturday|sunday)|next week|before the (demo|deadline|meeting))\b/i;

// add a full stop if missing
const endWithDot = (text) => (/[.!?]$/.test(text) ? text : text + '.');

// split everything that was said into sentences (3 words or more)
function toSentences(parts) {
  const sentences = [];
  parts.forEach((part) => {
    part.text.split(/(?<=[.!?])\s+/).forEach((s) => {
      s = s.trim();
      if (s.split(/\s+/).length < 3) return;
      sentences.push({ name: part.name, text: s.charAt(0).toUpperCase() + s.slice(1) });
    });
  });
  return sentences;
}

// picks the most important sentences: the ones using words that come up the most
function mostImportant(sentences, count) {
  const wordCount = {};
  const wordsOf = (s) => s.text.toLowerCase().match(/[a-z']+/g) || [];
  sentences.forEach((s) => wordsOf(s).forEach((w) => {
    if (!SKIP.has(w) && w.length > 2) wordCount[w] = (wordCount[w] || 0) + 1;
  }));

  return sentences
    .map((s, i) => {
      const words = wordsOf(s);
      const score = words.reduce((sum, w) => sum + (wordCount[w] || 0), 0) / Math.sqrt(words.length + 1);
      return { s, i, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .sort((a, b) => a.i - b.i) // back in the order they were said
    .map((x) => x.s);
}

export function generateMeetingNotes({ mode, transcript = [], events = [], manualNotes = [], meta }) {
  const date = new Date(meta.startedAt).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const length = duration(meta.endedAt - meta.startedAt);
  const time = `Time: ${clock(meta.startedAt)} to ${clock(meta.endedAt)} (${length})`;
  const people = meta.participants || [];

  if (mode === 'log') {
    const rows = [
      ...events.map((e) => ({ at: e.at, line: e.text })),
      ...transcript.map((t) => ({ at: t.at, line: `${t.name}: ${endWithDot(t.text)}` })),
      ...manualNotes.map((n) => ({ at: n.at, line: `Note by ${n.name}: ${endWithDot(n.text)}` })),
    ].sort((a, b) => a.at - b.at);

    // how many words each person said
    const words = {};
    transcript.forEach((t) => (words[t.name] = (words[t.name] || 0) + t.text.split(/\s+/).length));
    const totalWords = Object.values(words).reduce((a, b) => a + b, 0) || 1;

    const sections = [
      { h: 'Call details', items: [`Project: ${meta.project}`, `Date: ${date}`, time, `Participants: ${people.join(', ') || 'n/a'}`, `Log requested by ${meta.takenBy}`] },
      { h: 'Timeline', items: rows.length ? rows.map((r) => `[${clock(r.at)}] ${r.line}`) : ['No activity captured.'] },
      {
        h: 'Speaking time',
        items: Object.keys(words).length
          ? Object.entries(words).map(([name, w]) => `${name}: ${Math.round((w / totalWords) * 100)}% (${w} words)`)
          : ['No speech was transcribed.'],
      },
    ];
    return build(`Meeting log · ${meta.project}`, `${rows.length} timeline entries over ${length}.`, sections);
  }

  // meeting minutes
  const sentences = toSentences([...transcript, ...manualNotes]);

  const decisions = sentences.filter((s) => DECISION.test(s.text)).slice(0, 8);

  // action items: guess who should do it and when
  const actions = sentences
    .filter((s) => ACTION.test(s.text) && !DECISION.test(s.text) && !s.text.endsWith('?'))
    .slice(0, 10)
    .map((s) => {
      const named = people.find((p) => p !== s.name && new RegExp(`\\b${p.split(' ')[0]}\\b`, 'i').test(s.text));
      const saidI = /\bi('ll| will| am going to| need to)\b/i.test(s.text);
      const owner = named || (saidI ? s.name : /\bwe\b/i.test(s.text) ? 'Team' : s.name);
      const when = WHEN.exec(s.text)?.[0];
      return `${endWithDot(s.text)} (Owner: ${owner}${when ? `, Due: ${when}` : ''})`;
    });

  const questions = sentences.filter((s) => s.text.endsWith('?')).slice(0, 6).map((s) => `${s.name}: ${s.text}`);
  const summary = mostImportant(sentences, 3).map((s) => endWithDot(s.text)).join(' ');
  const discussion = mostImportant(sentences, 8).map((s) => `${s.name}: ${endWithDot(s.text)}`);
  const screenShares = events.filter((e) => e.type === 'screen');

  const sections = [
    { h: 'Meeting details', items: [`Project: ${meta.project}`, `Date: ${date}`, time, `Attendees: ${people.join(', ') || 'n/a'}`, `Minutes requested by ${meta.takenBy}`] },
    { h: 'Summary', items: [summary || 'No speech was transcribed during this call. Use the notes box during the call, or allow microphone access for live transcription.'] },
    { h: 'Key discussion points', items: discussion.length ? discussion : ['None captured.'] },
    { h: 'Decisions', items: decisions.length ? decisions.map((s) => `${endWithDot(s.text)} (raised by ${s.name})`) : ['No explicit decisions detected.'] },
    { h: 'Action items', items: actions.length ? actions : ['No action items detected.'] },
  ];
  if (questions.length) sections.push({ h: 'Open questions', items: questions });
  if (screenShares.length) sections.push({ h: 'Screens shared', items: screenShares.map((e) => `[${clock(e.at)}] ${e.text}`) });

  const preview = summary ? summary.slice(0, 160) : `Call with ${people.length} participants, ${length}.`;
  return build(`Meeting minutes · ${meta.project}`, preview, sections);
}

// also makes a markdown version so it can be downloaded
function build(title, preview, sections) {
  const markdown = `# ${title}\n\n` + sections.map((s) => `## ${s.h}\n${s.items.map((i) => `- ${i}`).join('\n')}`).join('\n\n');
  return { title, preview, sections, markdown };
}
