// all calls to the python backend go through this file.
// the backend is not made yet, so when VITE_API_URL is empty everything
// runs in the browser (demo mode). when the backend is ready, put its url
// in the .env file and these functions will call it instead.
//
// endpoints the backend needs:
//   POST /api/auth/signup        user details
//   POST /api/auth/login         { email, password }
//   POST /api/ai/parse-modules   module files -> modules and deadlines
//   POST /api/ai/parse-exams     exam files -> exams and coursework dates
//   POST /api/ai/parse-timetable timetable files -> weekly classes
//   POST /api/ai/meeting-notes   call transcript -> minutes or log
//
// the study quiz is different: it already has its own small backend (the
// backend folder), set with VITE_AI_URL. see services/ai.js
import { parseModuleFiles, parseExamFiles } from './aiParser';
import { parseTimetableFiles } from './timetable';
import { generateMeetingNotes } from './meetingNotes';
import { makeQuiz } from './quiz';

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
export const DEMO_MODE = !API_URL;

async function http(path, options = {}) {
  const isForm = options.body instanceof FormData;
  const res = await fetch(API_URL + path, {
    ...options,
    headers: isForm ? undefined : { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error((await res.text()) || `Request failed (${res.status})`);
  return res.json();
}

function filesForm(files) {
  const form = new FormData();
  files.forEach((f) => form.append('files', f, f.webkitRelativePath || f.name));
  return form;
}

export const api = {
  async login(email, password, localUsers) {
    if (!DEMO_MODE) {
      const data = await http('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      return data.user;
    }
    const user = localUsers.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!user) throw new Error('No account found for this email. Sign up first.');
    if (user.password !== password) throw new Error('Incorrect password.');
    return user;
  },

  async signup(user) {
    if (!DEMO_MODE) {
      const data = await http('/api/auth/signup', { method: 'POST', body: JSON.stringify(user) });
      return data.user;
    }
    return user;
  },

  async parseModules(files, onProgress) {
    if (!DEMO_MODE) return http('/api/ai/parse-modules', { method: 'POST', body: filesForm(files) });
    return parseModuleFiles(files, onProgress);
  },

  async parseExams(files, onProgress, modules = []) {
    if (!DEMO_MODE) {
      const form = filesForm(files);
      form.append('modules', JSON.stringify(modules.map(({ code, name }) => ({ code, name }))));
      return http('/api/ai/parse-exams', { method: 'POST', body: form });
    }
    return parseExamFiles(files, onProgress, modules);
  },

  async parseTimetable(files, onProgress, modules = []) {
    if (!DEMO_MODE) {
      const form = filesForm(files);
      form.append('modules', JSON.stringify(modules.map(({ code, name }) => ({ code, name }))));
      return http('/api/ai/parse-timetable', { method: 'POST', body: form });
    }
    return parseTimetableFiles(files, onProgress, modules);
  },

  // options = { modules, mod, material, ai, known }, see makeQuiz in quiz.js.
  // the files are read in the browser, the ai backend writes the questions.
  // returns { questions, files }
  async quiz(files, options = {}) {
    return makeQuiz(files, options);
  },

  async meetingNotes(data) {
    if (!DEMO_MODE) return http('/api/ai/meeting-notes', { method: 'POST', body: JSON.stringify(data) });
    return generateMeetingNotes(data);
  },
};
