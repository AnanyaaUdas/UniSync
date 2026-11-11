// talks to the ai backend (the backend folder, python + fastapi).
// the backend reads the text of photos (a timetable or exam routine sent
// as a picture) with google gemini. the api key is kept there, never in
// the browser.
//
// the address comes from VITE_AI_URL in the .env file, for example
// http://localhost:8000. when it is empty, or the backend is not running,
// photos can not be read and the student is told why (see textExtract.js).
const AI_URL = (import.meta.env.VITE_AI_URL || '').replace(/\/$/, '');

// stops waiting after some seconds
function withTimeout(seconds) {
  const stop = new AbortController();
  setTimeout(() => stop.abort(), seconds * 1000);
  return stop.signal;
}

// makes a photo smaller before it is sent (a phone photo can be 5 MB).
// returns the picture as base64 jpeg text
function shrink(file, longest = 1800) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, longest / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; // a png can be see-through, jpeg can not
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85).split(',')[1]);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('This picture could not be opened.'));
    };
    img.src = url;
  });
}

// sends a photo and gets back the text that is written on it.
// a table comes back with one row on each line
export async function aiImageText(file) {
  if (!AI_URL) throw new Error('Pictures are read by the AI backend, and VITE_AI_URL is not set in the .env file.');
  const res = await fetch(`${AI_URL}/api/ai/image-text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: await shrink(file), file: file.name }),
    signal: withTimeout(120),
  }).catch(() => {
    throw new Error(`Pictures are read by the AI backend, and it is not running at ${AI_URL}.`);
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || `The AI backend answered with an error (${res.status}).`);
  return data.text || '';
}
