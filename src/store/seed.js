import { dayFromNow as day, uid } from '../lib/format';

// demo students so the app can be tested without signing up
export const DEMO_PASSWORD = 'unisync123';

const USERS = [
  { id: 'ab', name: 'Abhishek Rao', initials: 'AR', color: '#4f46e5', dept: 'Computing', sem: '6th Semester', email: 'NP01CP4A240014@islingtoncollege.edu.np', lmuId: '23048612' },
  { id: 'an', name: 'Ananyaa Sharma', initials: 'AS', color: '#db2777', dept: 'Computing', sem: '6th Semester', email: 'NP01CP4A240021@islingtoncollege.edu.np', lmuId: '23048627' },
  { id: 'ka', name: 'Karan Mehta', initials: 'KM', color: '#0891b2', dept: 'Networking', sem: '6th Semester', email: 'NP01NT4A240033@islingtoncollege.edu.np', lmuId: '23048633' },
  { id: 'ri', name: 'Riya Nair', initials: 'RN', color: '#ea580c', dept: 'Multimedia', sem: '5th Semester', email: 'NP01MM4A240007@islingtoncollege.edu.np', lmuId: '23048647' },
  { id: 'de', name: 'Dev Patel', initials: 'DP', color: '#059669', dept: 'Artificial Intelligence', sem: '6th Semester', email: 'NP01AI4A240042@islingtoncollege.edu.np', lmuId: '23048652' },
].map((u) => ({ ...u, password: DEMO_PASSWORD, onboarded: false, nick: '', img: '' }));

// used when the student clicks "skip, use sample data" on the setup page.
// h is how many hours from now the deadline is
export function sampleAcademicData() {
  const modules = [
    { id: 'm-se', code: 'CS3040', name: 'Software Engineering', color: '#4f46e5' },
    { id: 'm-ai', code: 'CS3120', name: 'Artificial Intelligence', color: '#db2777' },
    { id: 'm-db', code: 'CS2210', name: 'Databases', color: '#7c3aed' },
    { id: 'm-os', code: 'CS2450', name: 'Operating Systems', color: '#0891b2' },
  ].map((m) => ({ ...m, files: [], source: 'sample' }));

  const task = (mod, title, h, status, kind = 'assignment', mode = 'personal', groupSize = null) => ({
    id: uid('s'), mod, title, due: day(h), status, kind, mode, groupSize,
    source: 'Sample coursework brief',
    modeReason: mode === 'team' ? 'The brief says this is group work' : 'The brief says this is individual work',
  });

  const deadlines = [
    task('m-se', 'Submit Sprint 2 retrospective report', 30, 'progress'),
    task('m-se', 'Read Chapter 7: Agile estimation', 240, 'done', 'reading'),
    task('m-se', 'Capstone group project: UniSync build', 960, 'todo', 'project', 'team', 4),
    task('m-ai', 'Tune CNN hyperparameters for lab 5', 96, 'progress', 'lab'),
    task('m-ai', 'Vision prototype group project', 720, 'todo', 'project', 'team', 3),
    task('m-db', 'Normalise library schema to 3NF', 44, 'progress'),
    task('m-db', 'Pair project: reporting stored procedures', 500, 'todo', 'project', 'team', 2),
    task('m-os', 'Implement round-robin scheduler in C', 310, 'review', 'lab'),
    task('m-os', 'Group presentation: memory management', 400, 'todo', 'presentation', 'team', 4),
  ];

  const exams = [
    { sub: 'Databases', code: 'CS2210', date: day(72), time: '09:00 to 12:00', room: 'Hall B' },
    { sub: 'Software Engineering', code: 'CS3040', date: day(150), time: '13:00 to 16:00', room: 'Hall A' },
    { sub: 'Artificial Intelligence', code: 'CS3120', date: day(300), time: '09:00 to 12:00', room: 'Lab 4' },
    { sub: 'Operating Systems', code: 'CS2450', date: day(460), time: '09:00 to 12:00', room: 'Hall C' },
  ].map((e) => ({ ...e, id: uid('e') }));

  return { modules, deadlines, exams };
}

// empty database the first time the app opens.
// modules, solo, exams, docs and personalFeed are stored per user id.
// group projects get made from the uploaded coursework pdfs.
export function seedDB() {
  return {
    users: USERS,
    modules: {},
    solo: {},
    exams: {},
    docs: {},
    personalFeed: {},
    calls: {},
    projects: [],
  };
}
