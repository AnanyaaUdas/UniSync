# unisync ai backend (fastapi).
#
# it does 2 jobs with a real ai model (google gemini):
#  1. it writes the multiple choice questions for the Study page
#  2. it reads the text on a photo (a class timetable or exam routine
#     that the student uploads as a picture)
#
# the react app reads the uploaded slides in the browser and sends the
# text of every slide here. we put that text in a prompt, gemini writes
# the questions, we check them and send them back as json.
#
# the api key stays in this folder (.env) and never goes to the browser.
#
# the questions for a file are saved in the quiz_cache folder. when another
# student uploads the same slides we send the saved questions back and do
# not call gemini again. the whole class has the same slides, so this keeps
# us inside the free limit of the api key.
#
# run it with:   uvicorn main:app --reload --port 8000
import base64
import binascii
import hashlib
import json
import os
import re
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from google.genai import types
from pydantic import BaseModel

load_dotenv()

API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite").strip()
# the react app is allowed to call us from these addresses
ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")]

# where the questions of each file are saved
CACHE_DIR = Path(os.getenv("QUIZ_CACHE_DIR", Path(__file__).parent / "quiz_cache"))

IMAGE_DIR = CACHE_DIR / "images"  # the text that was read from each photo
MAX_IMAGE = 6_000_000  # biggest photo we accept (bytes)

MAX_TEXT = 60000  # longest slide text we send to the model (characters)
MIN_QUESTIONS = 5
MAX_QUESTIONS = 25

app = FastAPI(title="UniSync AI backend")
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["*"], allow_headers=["*"])

client = genai.Client(api_key=API_KEY) if API_KEY else None


# ---------- what the react app sends ----------

class Slide(BaseModel):
    n: int  # slide or page number
    title: str = ""
    lines: list[str] = []


class QuizRequest(BaseModel):
    slides: list[Slide]
    module: str = ""  # like "CS2210 Databases"
    material: str = "lecture"  # lecture, tutorial or workshop
    file: str = ""  # file name, only used in error messages
    count: int = 0  # how many questions (0 = we decide)


# ---------- the prompt ----------

PROMPT = """You are a university lecturer writing a revision quiz for your students.

Write {count} multiple choice questions from the {material} material below{module}.

Rules for the questions:
- Test understanding of the subject: concepts, definitions, how things work, when to use them, differences between them, and what code or a command does.
- Every question must make sense on its own, without seeing the slides. Do not write "according to the slide" or "which of these is on the slide".
- Use only facts that are in the material. Do not ask about the lecturer, dates, deadlines, marks, room numbers, page numbers or the layout of the slides.
- Each question has exactly 4 options and exactly 1 of them is correct.
- The 3 wrong options must be believable answers from the same topic, about the same length as the correct one. Do not use "All of the above" or "None of the above".
- Write in clear, simple English. Keep each option short (under 25 words).
- "answer" is the position of the correct option, counting from 0. Spread the correct answers over all 4 positions.
- "explanation" is 1 short sentence that says why the correct option is right.
- "slide" is the number of the slide the question comes from.
- Spread the questions over the whole material, not only the first slides.

Reply with only a JSON array, no other text. Every item looks like this:
{{"question": "...", "options": ["...", "...", "...", "..."], "answer": 0, "explanation": "...", "slide": 3}}

MATERIAL
{text}
"""


def slides_as_text(slides: list[Slide]) -> str:
    parts = []
    for s in slides:
        lines = [line.strip() for line in s.lines if line.strip()]
        if not s.title.strip() and not lines:
            continue
        parts.append(f"--- Slide {s.n}: {s.title.strip()}\n" + "\n".join(lines))
    return "\n\n".join(parts)[:MAX_TEXT]


def how_many(slides: list[Slide], asked: int) -> int:
    if asked:
        return max(1, min(asked, MAX_QUESTIONS))
    # about 1 question for every slide that has some text on it
    with_text = sum(1 for s in slides if len(" ".join(s.lines)) > 40)
    return max(MIN_QUESTIONS, min(with_text, MAX_QUESTIONS))


# ---------- talking to gemini ----------

def ask_model(prompt: str) -> str:
    """sends the prompt to gemini and returns the text it wrote"""
    # the newer way of calling gemini. older versions of the library only
    # have generate_content, so we fall back to that
    if hasattr(client, "interactions"):
        try:
            return client.interactions.create(model=MODEL, input=prompt).output_text or ""
        except (AttributeError, TypeError):
            pass
    return client.models.generate_content(model=MODEL, contents=prompt).text or ""


def read_questions(text: str) -> list[dict]:
    """takes the json array out of the model's reply and keeps the good questions"""
    text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.MULTILINE).strip()
    start, end = text.find("["), text.rfind("]")
    if start < 0 or end < 0:
        return []
    try:
        items = json.loads(text[start:end + 1])
    except json.JSONDecodeError:
        return []

    good = []
    seen = set()
    for item in items if isinstance(items, list) else []:
        if not isinstance(item, dict):
            continue
        question = str(item.get("question", "")).strip()
        options = [str(o).strip() for o in item.get("options", [])] if isinstance(item.get("options"), list) else []
        answer = item.get("answer")
        # a question needs 4 different options and a correct one
        if not question or len(options) != 4 or not all(options):
            continue
        if len({o.lower() for o in options}) != 4:
            continue
        if not isinstance(answer, int) or isinstance(answer, bool) or not 0 <= answer <= 3:
            continue
        if question.lower() in seen:
            continue
        seen.add(question.lower())
        slide = item.get("slide")
        good.append({
            "text": question,
            "options": options,
            "answer": answer,
            "explain": str(item.get("explanation", "")).strip(),
            "slide": slide if isinstance(slide, int) and not isinstance(slide, bool) else 1,
        })
    return good


# ---------- reading a photo ----------

class ImageRequest(BaseModel):
    image: str  # the picture as base64 text (jpeg or png)
    file: str = ""


IMAGE_PROMPT = """Read this picture from a university student and write out the text on it.

- If it is a weekly class timetable, write one line for every class, like this:
  Day | HH:MM - HH:MM | class type | module code | module name | room
  Use the full name of the day and 24 hour times. If the timetable is a grid (days along one side, times along the other), still write one line for every class. Leave a part empty if it is not on the picture.
- If it is an exam routine or a list of deadlines, write one line for every row, with the cells separated by " | ". Keep dates exactly as they are written.
- For anything else, write the text line by line.

Write only what is on the picture. Do not add notes, headings or explanations of your own."""


def read_image(data: bytes) -> str:
    """sends the photo to gemini and returns the text on it"""
    mime = "image/png" if data[:8] == b"\x89PNG\r\n\x1a\n" else "image/jpeg"
    photo = types.Part.from_bytes(data=data, mime_type=mime)
    return client.models.generate_content(model=MODEL, contents=[photo, IMAGE_PROMPT]).text or ""


# ---------- saved questions ----------

def text_key(text: str) -> str:
    """the same slides always give the same key, also when the file has
    another name or the spaces and capitals are a bit different"""
    plain = re.sub(r"\s+", " ", text).strip().lower()
    return hashlib.sha256(plain.encode("utf-8")).hexdigest()


def saved_questions(key: str) -> list[dict]:
    try:
        saved = json.loads((CACHE_DIR / f"{key}.json").read_text(encoding="utf-8"))
        return saved["questions"]
    except (OSError, ValueError, KeyError):
        return []  # nothing saved yet, or the file is broken


def save_questions(key: str, questions: list[dict], file: str):
    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        data = {"file": file, "model": MODEL, "questions": questions}
        (CACHE_DIR / f"{key}.json").write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    except OSError:
        pass  # saving is only to spare the api key, the student still gets the questions


# ---------- the endpoints ----------

@app.get("/api/health")
def health():
    """lets the react app check if ai questions can be made"""
    saved = len(list(CACHE_DIR.glob("*.json"))) if CACHE_DIR.exists() else 0
    return {"ok": True, "ai": client is not None, "model": MODEL, "saved_files": saved}


@app.post("/api/ai/quiz")
def make_quiz(req: QuizRequest):
    text = slides_as_text(req.slides)
    if len(text) < 80:
        raise HTTPException(422, "This file has too little text to make questions from.")

    # somebody already uploaded these slides: use the saved questions
    key = text_key(text)
    saved = saved_questions(key)
    if saved:
        return {"questions": saved, "model": MODEL, "cached": True}

    if client is None:
        raise HTTPException(503, "No Gemini API key. Put GEMINI_API_KEY in backend/.env and start the backend again.")

    prompt = PROMPT.format(
        count=how_many(req.slides, req.count),
        material=req.material if req.material in ("lecture", "tutorial", "workshop") else "lecture",
        module=f" for the module {req.module}" if req.module else "",
        text=text,
    )

    try:
        reply = ask_model(prompt)
    except Exception as err:  # wrong key, no internet, too many requests, model name changed
        raise HTTPException(502, f"Gemini could not be reached: {str(err)[:300]}")

    questions = read_questions(reply)
    if not questions:
        raise HTTPException(502, "Gemini answered, but not with questions we could read. Try again.")
    save_questions(key, questions, req.file)
    return {"questions": questions, "model": MODEL, "cached": False}


@app.post("/api/ai/image-text")
def image_text(req: ImageRequest):
    try:
        data = base64.b64decode(req.image, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(422, "This is not a picture we can read.")
    if not data or len(data) > MAX_IMAGE:
        raise HTTPException(422, "This picture is empty or too big.")

    # the same photo was read before: use the saved text
    saved = IMAGE_DIR / f"{hashlib.sha256(data).hexdigest()}.txt"
    try:
        return {"text": saved.read_text(encoding="utf-8"), "model": MODEL, "cached": True}
    except OSError:
        pass

    if client is None:
        raise HTTPException(503, "No Gemini API key. Put GEMINI_API_KEY in backend/.env and start the backend again.")
    try:
        text = read_image(data).strip()
    except Exception as err:
        raise HTTPException(502, f"Gemini could not be reached: {str(err)[:300]}")
    if not text:
        raise HTTPException(502, "Gemini could not find any text on this picture.")

    try:
        IMAGE_DIR.mkdir(parents=True, exist_ok=True)
        saved.write_text(text, encoding="utf-8")
    except OSError:
        pass
    return {"text": text, "model": MODEL, "cached": False}
