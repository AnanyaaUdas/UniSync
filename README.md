# UniSync Frontend (React)

UniSync is a planner for university students. It keeps your own coursework and your group projects in one place. This is the React frontend. The Python backend is not made yet, so for now the app runs in "demo mode" and saves everything in the browser.

## How to run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # builds into dist/
```

You need Node 18 or newer. Use Chrome or Edge, because the meeting minutes use the browser's speech to text.

## How the app works

1. **Login or sign up** with an Islington College email like `NP01CP4A240001@islingtoncollege.edu.np`. Sign up also asks for your course, semester and London Met ID.
   There are no ready made accounts. Every student signs up with their own college email.
2. **Upload your modules folder** (one sub folder per module works best).
3. **Upload your class timetable** (the weekly routine with the day, time, module and room of every class). The timetable and the exam routine can also be a photo (JPG or PNG). A photo is read by the AI backend, so the backend has to be running for it.
4. **Upload your exam schedule folder**.
5. **Analysis**: the app reads the PDF, PowerPoint (.pptx), DOCX, TXT and CSV files and finds the modules, deadlines, weekly classes and exams. Coursework that is listed without a date (like "Coursework 2 (Group Coursework), Week 24") is also found, with a guessed date you are asked to check. For each coursework it checks if it is group work ("groups of 4", "pair project", "group presentation") or individual work, and shows why.
6. **Review**: you can edit, untick or switch any item between Individual and Group, then confirm.
   * Individual work goes on your individual board.
   * Group work becomes a group project with starter tasks spread out before the deadline.
   * You can't make projects by hand. Every student who uploads gets their own project for a piece of group coursework, named with the module name (like "Application Development · Coursework 2"). The rest of the group is added with **+ Member**. If the student you add has an untouched copy of the same project, that copy is removed.
   * **Class reminders**: at 20:00 each evening (you can change the time on the Schedule page) UniSync shows the classes you have the next day with the time and the room, in a pop up, in the bell and as a browser notification if you allow it. This works while UniSync is open in a browser tab. The Schedule page shows the timetable and lets you add or remove classes.
7. **Dashboard** with 3 pages: Individual, Group and Schedule.

Sample files to try it with are in `sample-uploads/` (a `Modules` folder and an `Exam Schedule` folder).

## Features

| Feature | Files |
|---|---|
| Login and sign up with college email | `components/auth` |
| Folder upload (choose or drag and drop) | `components/common/FolderDrop.jsx` |
| Reading modules, deadlines and exams from files | `services/aiParser.js`, `services/textExtract.js` |
| Individual board with module filter and live activity | `components/personal` |
| Group board with live activity | `components/team` |
| Group projects made from group coursework | `services/projectGenerator.js` |
| Group chat | `components/chat` |
| Video call and screen share | `components/call/useCall.js`, `CallRoom.jsx` |
| Meeting minutes or meeting log (one person per call), posted to the chat after the call | `components/call/callActions.js`, `services/meetingNotes.js` |
| Notifications for exams, deadlines and calls | `components/layout/Header.jsx` |
| Online status (green dot) | `store/presence.js` |
| Progress charts (how much is completed, who did how much) | `components/common/Donut.jsx`, `components/common/ProgressTable.jsx`, `components/team/GroupProgress.jsx`, `components/personal/PersonalProgress.jsx`, `lib/progress.js` |
| Semester feedback report (sent at the end of the semester, PDF download) | `components/report/SemesterReport.jsx`, `services/semesterReport.js`, `lib/pdf.js` |
| Canvas (group and individual) for class, database, activity and sequence diagrams and a work breakdown | `components/canvas/CanvasBoard.jsx`, `components/canvas/shapes.jsx`, `components/canvas/canvas.css` |
| Light and dark mode | `components/common/ThemeToggle.jsx` |
| Reading a photo of the timetable or exam routine with AI (Gemini) | `services/ai.js`, `services/textExtract.js`, `backend/main.py` |

### Progress charts

* On the **Group** page click **Progress**. The first chart shows all tasks by column (To Do, In Progress, Review, Completed). The second chart shows who did how much, as a share of the completed tasks.
* A task counts for the member it is assigned to, not for the person who dragged it.
* The table under the charts shows assigned, completed and overdue tasks for every member, with a progress bar.
* The **Individual** page has the same Board, Progress and Canvas tabs. Its Progress page shows your tasks by column and a table for every module (tasks, completed, overdue).
* The charts are drawn with plain SVG (`Donut.jsx`), no chart package.
* When a task is moved to Completed the app saves the time (`doneAt`), so the report can tell if it was finished on time.

### Semester feedback report

* The report shows individual tasks completed, the on-time rate, completion for each module, your share in each group and a short list of what went well, what to improve and what to do next semester.
* The feedback sentences come from rules in `services/semesterReport.js`. Later the backend can write them with an AI model.
* **When you get it:** the report of the current semester is not shown on the Schedule page. The day after the semester ends it is sent to you: a pop up, a notification in the bell and a browser notification if you allowed them. The semester ends on the date you set in Edit profile ("Semester ends on"), or on the date of your last exam if you leave that empty.
* **Download PDF** saves the report as an A4 PDF file. The PDF is made in the browser (`lib/pdf.js`), no library is needed.
* Reports of semesters you closed are listed on the Schedule page under "Past semester reports".
* **Year long and semester long modules:** every module is marked "1 semester" or "Year long". It is read from the slides ("Duration: Year Long", "Semester Long Module") and can be changed on the Review step and on the Schedule page. When a semester is closed, a 1 semester module is finished and a year long module continues for 1 more semester. The report says which modules continue.
* **Close semester and save report** keeps a copy under Past semesters, moves you to the next semester and stops completed tasks from being counted again. Tasks that are not finished carry over.

### Group canvas

* On the **Group** page click **Canvas**. Pick a diagram type at the top of the toolbar, then add shapes (click one, or drag it onto the canvas):
  * **Class and database**: Class, Table
  * **Activity diagram**: Start (black dot), Action, Decision (diamond), Fork / join bar, End (dot in a ring)
  * **Sequence diagram**: Actor, Lifeline
  * **Planning and notes**: Work item, Note
  * **Rectangle** is in every diagram type. As a filled box it is a normal box. As "Outline only" it goes behind the other shapes, so it works as a frame (loop, alt, swimlane) with its text in the top left corner. A thin filled rectangle on a lifeline works as an activation box.
* **Plain text:** double click an empty part of the canvas and type. Enter saves, Shift + Enter makes a new line. Double click the text to edit it again. Text size and colour are in the side panel.
* **Download and open again:** **Download PNG** saves the whole diagram as a picture. The shapes and lines are also saved inside the same PNG file (as JSON in a text block of the file, see `lib/pngData.js`), so the picture is the editable file too. **Open file** takes that PNG and puts the shapes back on the canvas, even after the canvas was cleared. If the canvas already has shapes, the opened ones are added to the right. The picture is made with `html-to-image`, kept at version 1.11.11 because newer versions draw the lines wrong. Only the original file works: a screenshot, or a picture sent through WhatsApp or Messenger, has the saved diagram removed.
* **Changing the size:** click a shape, then drag one of its corners. "Reset size" in the side panel puts it back. Lifeline length and fork / join length are picked in the side panel.
* The **Individual** page has its own Canvas tab with the same tools. It is saved under your user id (`canvas[userId]`) and only you can see it. There, **Tasks to WBS** builds the breakdown from your modules and individual tasks.
* Drag from the dot on the side of a shape to another shape to connect them. Pick the kind of line (association, inheritance, one to many and so on) in the toolbar, or click a line to change it. Click a line to type text on it, like `login()` or `[yes]`.
* Lines for activity diagrams: flow arrow, line with a dot at the end, arrow with a dot at the end. Lines for sequence diagrams: message, async message, reply (dashed), lost message (arrow to a dot) and found message (dot to an arrow).
* For a sequence diagram put the actors and lifelines in one row at the same height. Each lifeline has a connection dot every 30px down its dashed line, so a message drawn between dots at the same height is a straight horizontal arrow. Change the lifeline length in the side panel.
* Click a shape to edit its text and colour in the side panel. Delete with the Delete key or the button.
* **Tasks to WBS** builds a work breakdown structure from the tasks on the board (project, category, tasks).
* The canvas is saved as JSON on the project (`project.canvas = { nodes, edges }`) and every member sees changes live. Each change only touches the shape or line that was edited, so two members working on different shapes do not overwrite each other. If two members edit the same shape at the same moment, the last change wins.
* The canvas uses React Flow (`@xyflow/react`). It is loaded only when the Canvas tab is opened.

### Live activity fix

Before, the feed showed the person the task was given to, not the person who moved it. So when Abhishek dragged Riya's task it said "Riya moved…". Now the feed always uses the logged in user (see `logTeam()` in `store/db.js`) and says whose task it was, e.g. *"Abhishek moved Kanban UI polish (Riya's task) to Completed"*.

### Meeting minutes rules

* In a call click **Minutes** and pick **Meeting minutes** (summary, decisions, action items) or **Meeting log** (timeline and who spoke how long).
* Only the first person who turns it on can use it. For everyone else the button shows who has it. This check is in `startNotes()`, and the backend should do the same check.
* Each person's own mic is turned into text, so every line has the right name. Anyone can also type notes.
* When the last person leaves, the minutes or log are posted to the group chat as a card (view, copy, download). The person taking notes can also click **Stop and post now**.

## Showing it with two tabs

1. Open two tabs of the app in the same Chrome window.
2. Tab 1: log in as the first student, upload `sample-uploads/Modules` then `sample-uploads/Exam Schedule`, click Analyse files, check and confirm. 5 group projects are made.
3. Tab 2: log in as the second student and upload the same folders. They get their own 5 projects. In tab 1 press + Member and add the second student, who is then moved into the first student's project.
4. Both open **Group**. The first student drags a task and the other tab shows the move straight away.
5. The first student clicks **Start call**, the second gets a popup and clicks **Join**. Try **Share screen**.
6. The first student turns on **Minutes → Meeting minutes**. The other student's button is now locked.
7. Talk (or type notes), then both leave. The minutes show up in the group chat.

Tip: use headphones or mute one tab, because both tabs use the same mic and speakers.

## The AI backend (already made)

The `backend` folder is a small Python FastAPI server that reads the text on a photo of a timetable or exam routine with Google Gemini. It is set with `VITE_AI_URL` in `.env`. Steps are in `backend/README.md`.

## Connecting the rest of the Python backend later

Everything that needs a server goes through `src/services/api.js` and `src/store/db.js`.

1. Copy `.env.example` to `.env` and set `VITE_API_URL=http://localhost:8000`.
2. Make these endpoints in the backend:

```
POST /api/auth/signup
POST /api/auth/login
POST /api/ai/parse-modules      (files)
POST /api/ai/parse-exams        (files + modules list)
POST /api/ai/meeting-notes      ({ mode, transcript, events, manualNotes, meta })
POST /api/ai/semester-feedback  (report numbers -> feedback sentences, optional)
WS   /ws/projects/{id}          (board changes, canvas changes, feed, chat, online status, call signalling)
```

3. Right now the data is kept in `localStorage` and tabs talk to each other with `storage` events and `BroadcastChannel`. With the backend, change `update()` in `store/db.js` to call the API, and change the `BroadcastChannel` in `store/presence.js` and `components/call/useCall.js` to the WebSocket.
4. The canvas JSON can be stored in a JSON column of the project table. For many people editing the same shape at once, a CRDT library such as Yjs can be added on top of the WebSocket.
5. For calls between different networks, add a TURN server to the `ICE_SERVERS` list in `useCall.js`.

## Folders

```
src/
  App.jsx          login -> setup -> dashboard (individual, group, schedule)
  store/           saved data (db.js), empty start data, online status
  services/        api.js, file reading, meeting notes, semester report
  lib/             constants, date helpers and progress numbers
  components/
    auth/          login and sign up
    onboarding/    folder upload and review
    layout/        top bar and notifications
    personal/      individual board
    team/          group board, task panel and progress charts
    canvas/        group canvas and its shapes
    report/        semester feedback report
    chat/          group chat
    call/          video call and meeting minutes
    profile/       profile and schedule page
    common/        shared parts (kanban, activity feed, donut chart, icons, popups)
```
