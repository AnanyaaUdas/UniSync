# UniSync AI backend (Python)

This small FastAPI server reads the text on a photo (a class timetable or exam routine uploaded as a picture) with a real AI model (Google Gemini).

The React app makes the photo smaller and sends it here. This server gives it to Gemini, Gemini writes out the text on it line by line, and the server sends that text back. The API key stays in this folder and never goes to the browser.

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

Check that it works: open http://localhost:8000/api/health . It should show `"ai": true`.

## Endpoints

```
GET  /api/health         -> { ok, ai, model, saved_files }
POST /api/ai/image-text  { image: base64 jpeg or png, file }
                         -> { text, model, cached }
```

FastAPI also makes a test page for these at http://localhost:8000/docs .

## Photos

A class timetable or exam routine can be uploaded as a photo (JPG or PNG). The React app makes the photo smaller and sends it to `/api/ai/image-text`. Gemini writes out the text on it, with one class or one row on each line, and the app reads that text the same way it reads a PDF.

The text of each photo is saved in the `ai_cache/images` folder, so the same photo is only sent to Gemini once (the answer then has `"cached": true`). This keeps us inside the free limit of the key when a whole class uploads the same timetable. Photos only work while this backend is running; without it, upload the timetable as a PDF, Word or text file instead.

## Things to know

* The key is secret. `.env` is in `.gitignore`, do not upload it to GitHub or share it.
* The photo is sent to Google. Do not upload pictures you are not allowed to share.
* The free tier of the Gemini API has limits on requests per minute and per day. If you see "Gemini could not be reached" with 429 in the message, wait a minute and try again.
* Do not add a billing account to the key if you never want to pay. Without billing Google cannot charge you.
* The model is set with `GEMINI_MODEL` in `.env`. If Google retires a model name you get an error that says the model was not found. Pick a current one from https://ai.google.dev/gemini-api/docs/models and put it in `.env`.
* If the backend is not running, the app still works, but photos can not be read.

## Training the harsh language models

The meeting minutes hide harsh words. The models for this are trained with `train_harsh.py`.

1. Put the datasets in `backend/data/`:
   - `train.csv` from the Jigsaw toxic comment dataset (English)
   - `brb.xlsx` and `Nepali hate speech.xlsx` from the Nepali Hate Speech Collection on Kaggle
2. Run `python train_harsh.py` inside the backend folder.
3. The trained models are saved in `backend/models/` as `harsh_en.joblib` and `harsh_ne.joblib`.

The `data` folder is not in git because the files are big and belong to their authors.

## Training the minutes sentence model

This model sorts meeting sentences into decision, action, question or general, so the minutes only keep the important ones.

1. Open `labelled/minutes_sentences.xlsx` and pick a label for each sentence (the `guide` sheet explains the 4 labels).
2. Run `python train_minutes.py` inside the backend folder.
3. The trained model is saved as `models/minutes_type.joblib`.

The sentences come from the AMI Meeting Corpus (CC BY 4.0).
