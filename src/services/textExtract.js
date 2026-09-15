// gets the plain text out of an uploaded file so we can search it.
// pdf uses pdf.js, docx uses mammoth, txt/csv/md are read directly.
// images and scanned pdfs have no text so they return an empty string.
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const extension = (name) => (name.split('.').pop() || '').toLowerCase();

async function pdfText(file) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const lines = [];

  for (let n = 1; n <= Math.min(doc.numPages, 40); n++) {
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

    [...rows.entries()]
      .sort((a, b) => b[0] - a[0])
      .forEach(([, words]) => lines.push(words.sort((a, b) => a.x - b.x).map((w) => w.text).join('  ')));
  }
  return lines.join('\n');
}

async function docxText(file) {
  const mammoth = (await import('mammoth')).default;
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return result.value;
}

export async function extractText(file) {
  const ext = extension(file.name);
  try {
    if (ext === 'pdf') return await pdfText(file);
    if (ext === 'docx') return await docxText(file);
    if (ext === 'csv') return (await file.text()).replace(/,/g, '  |  ');
    if (['txt', 'md'].includes(ext)) return await file.text();
  } catch (err) {
    console.warn('could not read', file.name, err);
  }
  return '';
}
