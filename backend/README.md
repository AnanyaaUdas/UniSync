# UniSync AI backend (Python)

This small FastAPI server writes the multiple choice questions for the Study page with a real AI model (Google Gemini).

The React app reads the uploaded slides in the browser and sends the text of each slide here. This server puts the text in a prompt, Gemini writes the questions, the server checks them (4 different options, 1 correct answer) and sends them back. The API key stays in this folder and never goes to the browser.

## Set up (one time)

You need Python 3.10 or newer.

1. Get a Gemini API key: open https://aistudio.google.com/apikey , sign in with your Google account and create a key.
2. In a terminal, go to this folder and install the packages:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

3. Copy `.env.example` to `.env` and paste your key after `GEMINI_API_KEY=`:

```bash
cp .env.example .env
```

4. In the main project folder (one level up), make a `.env` file with this line, so the React app knows where the backend is:

```
VITE_AI_URL=http://localhost:8000
```

## Run

Every time you work on the project, start the backend in one terminal:

```bash
cd backend
source .venv/bin/activate
uvicorn main:app --reload --port 8000
```

and the React app in another terminal (`npm run dev`). Restart `npm run dev` once after you add `VITE_AI_URL`.

Check that it works: open http://localhost:8000/api/health . It should show `"ai": true`. On the Study page, the upload popup then says "AI questions are on".

## Endpoints

```
GET  /api/health     -> { ok, ai, model, saved_files }
POST /api/ai/quiz    { slides: [{ n, title, lines }], module, material, file, count }
                     -> { questions: [{ text, options: [4], answer, explain, slide }], model, cached }
POST /api/ai/image-text  { image: base64 jpeg or png, file }
                     -> { text, model, cached }
```

FastAPI also makes a test page for these at http://localhost:8000/docs .

## Saved questions (staying inside the free limit)

The free Gemini key has a limit of requests per minute and per day, and every student uses the same key. To stay inside it, the questions for a file are saved in the `quiz_cache` folder (one small json file for each set of slides). When another student uploads the same slides, the saved questions are sent back and Gemini is not called, so a whole class uploading the same lecture is 1 request and not 1 for each student.

* The slides are matched by their text, not by the file name, so a renamed copy of the same file still matches.
* The answer has `"cached": true` when saved questions were used.
* To make new questions for a file, delete its json file in `quiz_cache` (or the whole folder).
* Do not add a billing account to the key if you never want to pay. Without billing Google cannot charge you. When the free limit is used up the request fails and the Study page uses its basic questions for that file.

## Photos

A class timetable or exam routine can be uploaded as a photo (JPG or PNG). The React app makes the photo smaller and sends it to `/api/ai/image-text`. Gemini writes out the text on it, with one class or one row on each line, and the app reads that text the same way it reads a PDF. The text of each photo is saved in `quiz_cache/images`, so the same photo is only sent to Gemini once. Photos only work while this backend is running.

## Things to know

* The key is secret. `.env` is in `.gitignore`, do not upload it to GitHub or share it.
* The text of the slides is sent to Google. Do not upload material you are not allowed to share.
* The free tier of the Gemini API has limits on requests per minute and per day. If you see "Gemini could not be reached" with 429 in the message, wait a minute and try again. The app makes basic questions for that file in the meantime.
* The model is set with `GEMINI_MODEL` in `.env`. If Google retires a model name you get an error that says the model was not found. Pick a current one from https://ai.google.dev/gemini-api/docs/models and put it in `.env`.
* If the backend is not running, the app still works and makes basic questions in the browser, which are much weaker.
