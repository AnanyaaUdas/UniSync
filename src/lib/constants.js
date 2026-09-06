// college related values used in signup and profile
export const ALLOWED_DOMAINS = ['islingtoncollege.edu.np'];
export const DEPTS = ['Computing', 'Artificial Intelligence', 'Multimedia', 'Networking'];
export const SEMS = ['1st Semester', '2nd Semester', '3rd Semester', '4th Semester', '5th Semester', '6th Semester'];

// london met id is only numbers, like 23048612
export const LMU_ID_RE = /^\d{7,9}$/;

// colours given to users and modules
export const PALETTE = ['#4f46e5', '#db2777', '#0891b2', '#ea580c', '#059669', '#7c3aed', '#ca8a04', '#e11d48'];

// the 4 columns of every kanban board
export const COLS = [
  { id: 'todo', name: 'To Do', color: '#64748b', bg: '#f1f5f9' },
  { id: 'progress', name: 'In Progress', color: '#4f46e5', bg: '#e0e7ff' },
  { id: 'review', name: 'Review', color: '#d97706', bg: '#fef3c7' },
  { id: 'done', name: 'Completed', color: '#059669', bg: '#d1fae5' },
];
export const colById = (id) => COLS.find((c) => c.id === id) || COLS[0];

// categories for group tasks and their colours
export const TAGS = ['Backend', 'Frontend', 'Database', 'Testing', 'Docs', 'DevOps', 'Research'];
export const TAG_COLORS = { Backend: '#4f46e5', Frontend: '#0891b2', Database: '#7c3aed', Testing: '#db2777', Docs: '#64748b', DevOps: '#059669', Research: '#ca8a04' };

// types of individual deadlines
export const DEADLINE_KINDS = {
  assignment: 'Assignment',
  coursework: 'Coursework',
  lab: 'Lab',
  quiz: 'Quiz / Test',
  presentation: 'Presentation',
  project: 'Project',
  reading: 'Reading',
};
