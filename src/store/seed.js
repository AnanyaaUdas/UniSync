// empty database the first time the app opens. there are no ready made
// accounts: every student signs up with their college email.
// modules, solo, exams, classes, docs, personalFeed and reports are stored per user id.
// group projects get made from the uploaded coursework pdfs.
export function seedDB() {
  return {
    users: [],
    modules: {},
    solo: {},
    exams: {},
    classes: {}, // each student's weekly class timetable
    remind: {}, // the time each student gets the reminder for tomorrow's classes
    semEnd: {}, // the date each student's semester ends (empty = after the last exam)
    docs: {},
    personalFeed: {},
    calls: {},
    reports: {}, // saved semester feedback reports
    reportClosed: {}, // ids of tasks already counted in a saved report
    canvas: {}, // each student's own canvas (group canvases are on the project)
    projects: [], // each project also keeps its tasks, chat, feed and canvas
  };
}
