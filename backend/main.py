# unisync ai backend (fastapi).
#
# it does 1 job with a real ai model (google gemini): it reads the text on
# a photo (a class timetable or exam routine that the student uploads as a
# picture). the react app makes the photo smaller and sends it here, gemini
# writes out the text and we send it back as json.
#
# the api key stays in this folder (.env) and never goes to the browser.
#
# the text of every photo is saved in the ai_cache folder. when the same
# photo is sent again we send the saved text back and do not call gemini
# again. this keeps us inside the free limit of the api key.
#
# run it with:   uvicorn main:app --reload --port 8000
import base64
import binascii
import hashlib
import os
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

# where the text read from each photo is saved
CACHE_DIR = Path(os.getenv("AI_CACHE_DIR", Path(__file__).parent / "ai_cache"))
IMAGE_DIR = CACHE_DIR / "images"
MAX_IMAGE = 6_000_000  # biggest photo we accept (bytes)

app = FastAPI(title="UniSync AI backend")
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["*"], allow_headers=["*"])

client = genai.Client(api_key=API_KEY) if API_KEY else None


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


# ---------- the endpoints ----------

@app.get("/api/health")
def health():
    """lets the react app check if the backend is running and has a key"""
    saved = len(list(IMAGE_DIR.glob("*.txt"))) if IMAGE_DIR.exists() else 0
    return {"ok": True, "ai": client is not None, "model": MODEL, "saved_files": saved}


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
