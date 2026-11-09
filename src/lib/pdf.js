// makes a pdf file in the browser without a library.
// every page of the pdf is one jpeg picture (A4 size), so the report
// looks the same as on the screen. used by the semester feedback report.

const A4 = { w: 595, h: 842 }; // size of an A4 page in pdf points
const MARGIN = 28;

const bytes = (text) => new TextEncoder().encode(text);

// pages = [{ data: Uint8Array (jpeg), w, h }] where w and h are the pixels of the picture.
// returns a Blob with the pdf
function pdfFromJpegs(pages) {
  const parts = [];
  const offsets = []; // where every object starts, the pdf needs this at the end
  let size = 0;
  const add = (chunk) => {
    const data = typeof chunk === 'string' ? bytes(chunk) : chunk;
    parts.push(data);
    size += data.length;
  };
  const object = (number, body) => {
    offsets[number] = size;
    add(`${number} 0 obj\n`);
    body();
    add('\nendobj\n');
  };

  add('%PDF-1.4\n');
  // object 1 is the document, object 2 the list of pages,
  // then 3 objects for every page: the page, what to draw, the picture
  const pageNumber = (i) => 3 + i * 3;
  object(1, () => add('<< /Type /Catalog /Pages 2 0 R >>'));
  object(2, () => add(`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${pageNumber(i)} 0 R`).join(' ')}] >>`));

  pages.forEach((page, i) => {
    const n = pageNumber(i);
    // the picture fills the width between the margins and starts at the top
    const width = A4.w - MARGIN * 2;
    const height = (page.h / page.w) * width;
    const draw = `q ${width.toFixed(2)} 0 0 ${height.toFixed(2)} ${MARGIN} ${(A4.h - MARGIN - height).toFixed(2)} cm /Im0 Do Q`;

    object(n, () => add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.w} ${A4.h}] /Resources << /XObject << /Im0 ${n + 2} 0 R >> >> /Contents ${n + 1} 0 R >>`));
    object(n + 1, () => add(`<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`));
    object(n + 2, () => {
      add(`<< /Type /XObject /Subtype /Image /Width ${page.w} /Height ${page.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.data.length} >>\nstream\n`);
      add(page.data);
      add('\nendstream');
    });
  });

  const count = 3 + pages.length * 3;
  const tableStart = size;
  add(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let n = 1; n < count; n++) add(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`);
  add(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${tableStart}\n%%EOF`);

  return new Blob(parts, { type: 'application/pdf' });
}

// how tall one page of the picture can be, for a picture that is `width` pixels wide
const pageHeightFor = (width) => Math.floor((width * (A4.h - MARGIN * 2)) / (A4.w - MARGIN * 2));

// cuts a tall canvas into A4 pages. `breaks` are the y positions (in canvas
// pixels) where a block ends, so a page is not cut through the middle of a block
export async function canvasToPdf(canvas, breaks = []) {
  const pageHeight = pageHeightFor(canvas.width);
  const cuts = [...new Set(breaks.map(Math.round))].sort((a, b) => a - b);
  const pages = [];
  let top = 0;

  while (top < canvas.height - 2) {
    let bottom = Math.min(top + pageHeight, canvas.height);
    if (bottom < canvas.height) {
      // the last block end that still fits on this page (but not a tiny page)
      const fit = cuts.filter((y) => y > top + pageHeight * 0.4 && y <= bottom).pop();
      if (fit) bottom = fit;
    }
    const part = document.createElement('canvas');
    part.width = canvas.width;
    part.height = bottom - top;
    part.getContext('2d').drawImage(canvas, 0, top, canvas.width, part.height, 0, 0, canvas.width, part.height);
    const blob = await new Promise((resolve) => part.toBlob(resolve, 'image/jpeg', 0.92));
    pages.push({ data: new Uint8Array(await blob.arrayBuffer()), w: part.width, h: part.height });
    top = bottom;
  }
  return pdfFromJpegs(pages);
}
