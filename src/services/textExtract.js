// gets the plain text out of an uploaded file so we can search it.
// pdf uses pdf.js, docx uses mammoth, pptx is unzipped with jszip,
// txt/csv/md are read directly.
// a photo (jpg, png) has no text in it, so it is sent to the ai backend
// which reads the writing on it. this is only done where a photo is
// expected (the class timetable and the exam routine).
// scanned pdfs have no text so they return an empty string.
//
// extractText(file)   -> all the text as one string (used by aiParser.js)
// extractRows(file)   -> the lines, with a table row on one line (used by timetable.js)
// extractSlides(file) -> the text slide by slide: [{ n, title, lines }]
//                        (used by quiz.js to make quiz questions)
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { aiImageText } from './ai';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const extension = (name) => (name.split('.').pop() || '').toLowerCase();

export const isImage = (file) => ['jpg', 'jpeg', 'png', 'webp'].includes(extension(file.name));

// why the last photo could not be read, shown to the student
export const imageErrors = new Map();

// ---------- pdf ----------

// the lines of every page, top to bottom
async function pdfPages(file) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = [];

  for (let n = 1; n <= Math.min(doc.numPages, 120); n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();

    // pdf.js gives separate words, so group them by their height on the page.
    // this keeps a timetable row (date, subject, time, room) on one line
    const rows = new Map();
    content.items.forEach((item) => {
      if (!item.str.trim()) return;
      const y = Math.round(item.transform[5] / 3) * 3;
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y).push({ x: item.transform[4], text: item.str.trim() });
    });

    pages.push([...rows.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, words]) => words.sort((a, b) => a.x - b.x).map((w) => w.text).join('  ')));
  }
  return pages;
}

// ---------- powerpoint ----------

// a .pptx file is a zip with one xml file for each slide. on a slide every
// text box is a <p:sp>, every paragraph a <a:p> and every piece of text a <a:t>
async function pptxSlides(file) {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const number = (name) => Number(name.match(/slide(\d+)\.xml$/)[1]);
  const names = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort((a, b) => number(a) - number(b));

  const slides = [];
  for (const name of names) {
    const xml = new DOMParser().parseFromString(await zip.file(name).async('text'), 'application/xml');
    let title = '';
    const lines = [];

    [...xml.getElementsByTagName('p:sp')].forEach((box) => {
      const kind = box.getElementsByTagName('p:ph')[0]?.getAttribute('type') || '';
      const paragraphs = [...box.getElementsByTagName('a:p')]
        .map((p) => [...p.getElementsByTagName('a:t')].map((t) => t.textContent).join('').trim())
        .filter(Boolean);
      if (!paragraphs.length || /^(sldNum|ftr|dt)$/.test(kind)) return; // slide number, footer, date
      if (!title && /title/i.test(kind)) title = paragraphs.join(' ');
      else lines.push(...paragraphs);
    });

    // text inside tables
    [...xml.getElementsByTagName('a:tr')].forEach((row) => {
      const cells = [...row.getElementsByTagName('a:tc')].map((cell) => [...cell.getElementsByTagName('a:t')].map((t) => t.textContent).join('').trim());
      if (cells.some(Boolean)) lines.push(cells.join('  |  '));
    });

    slides.push({ n: slides.length + 1, title, lines });
  }
  return slides;
}

// ---------- word ----------

async function docxText(file) {
  const mammoth = (await import('mammoth')).default;
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return result.value;
}

// ---------- everything as one string ----------

export async function extractText(file, { images = false } = {}) {
  const ext = extension(file.name);
  if (images && isImage(file)) {
    try {
      imageErrors.delete(file.name);
      return await aiImageText(file);
    } catch (err) {
      imageErrors.set(file.name, err.message);
      return '';
    }
  }
  try {
    if (ext === 'pdf') return (await pdfPages(file)).map((lines) => lines.join('\n')).join('\n');
    if (ext === 'pptx') return (await pptxSlides(file)).map((s) => [s.title, ...s.lines].join('\n')).join('\n');
    if (ext === 'docx') return await docxText(file);
    if (ext === 'csv') return (await file.text()).replace(/,/g, '  |  ');
    if (['txt', 'md'].includes(ext)) return await file.text();
  } catch (err) {
    console.warn('could not read', file.name, err);
  }
  return '';
}

// ---------- row by row ----------

// the lines of a file, with every table row kept on one line (the cells
// have " | " between them). used for timetables. in a word file the normal
// text has every cell on its own line, so we read its tables from the html
export async function extractRows(file) {
  if (extension(file.name) === 'docx') {
    try {
      const mammoth = (await import('mammoth')).default;
      const { value } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
      const page = new DOMParser().parseFromString(value, 'text/html');
      const lines = [];
      page.body.querySelectorAll('tr, p, h1, h2, h3, li').forEach((el) => {
        if (el.tagName === 'TR') lines.push([...el.children].map((cell) => cell.textContent.trim()).join('  |  '));
        else if (!el.closest('tr')) lines.push(el.textContent.trim());
      });
      return lines.filter(Boolean);
    } catch (err) {
      console.warn('could not read', file.name, err);
    }
  }
  return (await extractText(file, { images: true })).split('\n').map((l) => l.trim()).filter(Boolean);
}

// ---------- slide by slide ----------

// a short line with no full stop that is followed by more text
const looksLikeHeading = (line, next) => next && line.length <= 70 && line.split(/\s+/).length <= 9 && !/[.?!;:,]$/.test(line) && !/^[•●▪·\-–*]/.test(line);

// word and text files have no slides, so every heading starts a new part
function sectionsOf(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const parts = [];
  let part = { n: 1, title: '', lines: [] };
  lines.forEach((line, i) => {
    if (looksLikeHeading(line.replace(/^#+\s*/, ''), lines[i + 1]) || /^#+\s/.test(line)) {
      if (part.title || part.lines.length) parts.push(part);
      part = { n: parts.length + 1, title: line.replace(/^#+\s*/, ''), lines: [] };
    } else {
      part.lines.push(line);
    }
  });
  if (part.title || part.lines.length) parts.push(part);
  return parts;
}

// returns [{ n, title, lines }]: one item for each slide (pptx), page (pdf)
// or part under a heading (docx, txt, md)
export async function extractSlides(file) {
  const ext = extension(file.name);
  try {
    if (ext === 'pptx') return await pptxSlides(file);
    if (ext === 'pdf') {
      // on a slide that was saved as pdf the first line of the page is the title
      return (await pdfPages(file)).map((lines, i) => ({ n: i + 1, title: lines[0] || '', lines: lines.slice(1) }));
    }
    if (ext === 'docx') return sectionsOf(await docxText(file));
    if (['txt', 'md'].includes(ext)) return sectionsOf(await file.text());
  } catch (err) {
    console.warn('could not read', file.name, err);
  }
  return [];
}
