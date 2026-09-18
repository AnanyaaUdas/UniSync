// makes group projects from the group coursework found in the pdfs.
// students can't create projects themselves. if a classmate already
// uploaded the same brief, you get added to their project instead of
// making a new one, so the whole group ends up on the same board.
import { uid, fmtDate, dayFromNow, daysTo } from '../lib/format';
import { logTeam, userById, displayName } from '../store/db';

// same module code + same title (ignoring small words) = same project
function projectKey(code, title) {
  const cleanTitle = title
    .toLowerCase()
    .replace(/\b(group|team|project|coursework|cw|the|a|an)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return `${(code || '').toUpperCase()}|${cleanTitle}`;
}

// starter tasks for a new project, spread out before the deadline.
// the number is how far through the time the task should be due (0.3 = 30%)
const PRESENTATION_STEPS = [
  ['Kick-off: agree roles and split the presentation', 'Docs', 0.1, ['Pick a group leader', 'Split sections between members']],
  ['Research content for each section', 'Research', 0.35, ['Collect sources', 'Share notes in the chat']],
  ['Build the slide deck', 'Frontend', 0.6, ['Draft slides', 'Consistent design']],
  ['Prepare the live demo', 'Backend', 0.75, ['Demo script', 'Backup recording']],
  ['Full rehearsal and timing check', 'Testing', 0.9, ['Rehearse once together', 'Fix feedback']],
];
const PROJECT_STEPS = [
  ['Kick-off: read the brief, agree roles and split the work', 'Docs', 0.1, ['Read the marking criteria', 'Assign owners to each part']],
  ['Research and requirements', 'Research', 0.3, ['Gather references', 'List requirements']],
  ['Build / draft the main deliverable', 'Backend', 0.6, ['First complete draft', 'Share for feedback']],
  ['Testing, review and fixes', 'Testing', 0.8, ['Peer review each part', 'Fix issues']],
  ['Write up the report and references', 'Docs', 0.9, ['Merge sections', 'Check referencing style']],
];

function starterTasks(title, kind, due, me) {
  const daysLeft = Math.max(daysTo(due), 3);
  const steps = kind === 'presentation' ? PRESENTATION_STEPS : PROJECT_STEPS;

  const tasks = steps.map(([taskTitle, tag, part, subs]) => ({
    id: uid('t'),
    title: taskTitle,
    col: 'todo',
    assignee: me,
    due: dayFromNow(Math.max(1, Math.round(daysLeft * part)) * 24),
    tag,
    subs: subs.map((s) => ({ t: s, d: false })),
    comments: [],
  }));

  tasks.push({
    id: uid('t'),
    title: `Final submission: ${title}`,
    col: 'todo',
    assignee: me,
    due,
    tag: 'Docs',
    subs: [{ t: 'Final check against the brief', d: false }, { t: 'Submit before the deadline', d: false }],
    comments: [],
  });
  return tasks;
}

// items = [{ title, due, kind, groupSize, source, module: { code, name } }]
// returns how many projects were made and how many were joined
export function applyTeamProjects(d, me, items) {
  let created = 0;
  let joined = 0;

  items.forEach((item) => {
    const key = projectKey(item.module.code, item.title);
    const existing = d.projects.find((p) => p.key === key);

    if (existing) {
      if (!existing.members.includes(me)) {
        existing.members.push(me);
        logTeam(d, existing.id, me, `joined the project (matched from **${item.source || 'their coursework PDF'}**)`);
        existing.chat.push({ id: uid('c'), type: 'system', who: me, txt: `${displayName(userById(d, me))} joined the group.`, at: Date.now() });
      }
      joined++;
      return;
    }

    const id = uid('p');
    const size = item.groupSize ? `groups of ${item.groupSize}` : 'group coursework';
    d.projects.push({
      id,
      key,
      name: `${item.module.code ? item.module.code + ' · ' : ''}${item.title}`.slice(0, 70),
      sub: `${item.module.name || 'Group coursework'} · ${size} · due ${fmtDate(item.due)}`,
      groupSize: item.groupSize ? Number(item.groupSize) : null,
      members: [me],
      tasks: starterTasks(item.title, item.kind, item.due, me),
      feed: [],
      chat: [],
    });
    logTeam(d, id, me, `set up this project from **${item.source || 'the coursework brief'}**`);
    created++;
  });

  return { created, joined };
}
