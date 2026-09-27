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
   Demo accounts (password `unisync123`): Abhishek `NP01CP4A240014`, Ananyaa `NP01CP4A240021`, Karan `NP01NT4A240033`, Riya `NP01MM4A240007`, Dev `NP01AI4A240042`. On the login page you can just click a name.
2. **Upload your modules folder** (one sub folder per module works best).
3. **Upload your exam schedule folder**.
4. **Analysis**: the app reads the PDF, DOCX, TXT and CSV files and finds the modules, deadlines and exams. For each coursework it checks if it is group work ("groups of 4", "pair project", "group presentation") or individual work, and shows why.
5. **Review**: you can edit, untick or switch any item between Individual and Group, then confirm.
   * Individual work goes on your individual board.
   * Group work becomes a group project with starter tasks spread out before the deadline.
   * You can't make projects by hand. If a classmate already uploaded the same brief, you join their project instead of making a copy.
6. **Dashboard** with 3 pages: Individual, Group and Schedule.

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
| Light and dark mode | `components/common/ThemeToggle.jsx` |

### Live activity fix

Before, the feed showed the person the task was given to, not the person who moved it. So when Abhishek dragged Riya's task it said "Riya moved…". Now the feed always uses the logged in user (see `logTeam()` in `store/db.js`) and says whose task it was, e.g. *"Abhishek moved Kanban UI polish (Riya's task) to Completed"*.

### Meeting minutes rules

* In a call click **Minutes** and pick **Meeting minutes** (summary, decisions, action items) or **Meeting log** (timeline and who spoke how long).
* Only the first person who turns it on can use it. For everyone else the button shows who has it. This check is in `startNotes()`, and the backend should do the same check.
* Each person's own mic is turned into text, so every line has the right name. Anyone can also type notes.
* When the last person leaves, the minutes or log are posted to the group chat as a card (view, copy, download). The person taking notes can also click **Stop and post now**.

## Demo with two tabs

1. Open two tabs of the app in the same Chrome window.
2. Tab 1: log in as Abhishek, upload `sample-uploads/Modules` then `sample-uploads/Exam Schedule`, click Analyse files, check and confirm. 5 group projects are made.
3. Tab 2: log in as Riya and upload the same folders. Riya joins the same 5 projects.
4. Both open **Group**. Abhishek drags a task and Riya's tab shows "Abhishek moved…" straight away.
5. Abhishek clicks **Start call**, Riya gets a popup and clicks **Join**. Try **Share screen**.
6. Abhishek turns on **Minutes → Meeting minutes**. Riya's button is now locked.
7. Talk (or type notes), then both leave. The minutes show up in the group chat.

Tip: use headphones or mute one tab, because both tabs use the same mic and speakers.

## Connecting the Python backend later

Everything that needs a server goes through `src/services/api.js` and `src/store/db.js`.

1. Copy `.env.example` to `.env` and set `VITE_API_URL=http://localhost:8000`.
2. Make these endpoints in the backend:

```
POST /api/auth/signup
POST /api/auth/login
POST /api/ai/parse-modules      (files)
POST /api/ai/parse-exams        (files + modules list)
POST /api/ai/meeting-notes      ({ mode, transcript, events, manualNotes, meta })
WS   /ws/projects/{id}          (board changes, feed, chat, online status, call signalling)
```

3. Right now the data is kept in `localStorage` and tabs talk to each other with `storage` events and `BroadcastChannel`. With the backend, change `update()` in `store/db.js` to call the API, and change the `BroadcastChannel` in `store/presence.js` and `components/call/useCall.js` to the WebSocket.
4. For calls between different networks, add a TURN server to the `ICE_SERVERS` list in `useCall.js`.

## Folders

```
src/
  App.jsx          login -> setup -> dashboard
  store/           saved data (db.js), demo data, online status
  services/        api.js, file reading, meeting notes
  lib/             constants and date helpers
  components/
    auth/          login and sign up
    onboarding/    folder upload and review
    layout/        top bar and notifications
    personal/      individual board
    team/          group board and task panel
    chat/          group chat
    call/          video call and meeting minutes
    profile/       profile and schedule page
    common/        shared parts (kanban, activity feed, icons, popups)
```
