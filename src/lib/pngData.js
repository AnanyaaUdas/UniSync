// hides text inside a png picture, and reads it back.
// the canvas uses this so one downloaded picture is also the editable
// file: the picture shows the diagram, and the shapes and lines are
// saved inside it as json.
//
// a png file is a list of blocks ("chunks"). each chunk is:
//   4 bytes length, 4 bytes type, the data, 4 bytes checksum (crc)
// a chunk of type "tEXt" holds a keyword and some text. picture viewers
// ignore it. we add one just before the last chunk ("IEND").

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]; // first 8 bytes of every png

// the checksum png uses (crc32)
const TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const isPng = (bytes) => SIGNATURE.every((b, i) => bytes[i] === b);
const typeAt = (bytes, at) => String.fromCharCode(bytes[at + 4], bytes[at + 5], bytes[at + 6], bytes[at + 7]);
const lengthAt = (bytes, at) => new DataView(bytes.buffer, bytes.byteOffset).getUint32(at);

// plain letters from a tEXt chunk -> text of any language
const decode = (letters) => new TextDecoder().decode(Uint8Array.from(atob(letters), (ch) => ch.charCodeAt(0)));

// returns a new png (Uint8Array) with the text saved under the keyword
export function addText(png, keyword, text) {
  if (!isPng(png)) throw new Error('This is not a PNG picture.');

  const data = new TextEncoder().encode(`${keyword}\0${encode(text)}`);
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  chunk.set([116, 69, 88, 116], 4); // "tEXt"
  chunk.set(data, 8);
  view.setUint32(8 + data.length, crc(chunk.subarray(4, 8 + data.length)));

  // put it before the IEND chunk, which is always the last 12 bytes
  const end = png.length - 12;
  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, end), 0);
  out.set(chunk, end);
  out.set(png.subarray(end), end + chunk.length);
  return out;
}

// text of any language -> plain letters that are safe inside a tEXt chunk.
// done in pieces because a very long text can't be turned into letters in one go
function encode(text) {
  const bytes = new TextEncoder().encode(text);
  let letters = '';
  for (let i = 0; i < bytes.length; i += 0x6000) letters += String.fromCharCode(...bytes.subarray(i, i + 0x6000));
  return btoa(letters);
}

// returns the text saved under the keyword, or null when the picture has none
export function readText(png, keyword) {
  if (!isPng(png)) return null;
  let at = 8;
  while (at + 12 <= png.length) {
    const length = lengthAt(png, at);
    if (typeAt(png, at) === 'tEXt') {
      const data = png.subarray(at + 8, at + 8 + length);
      const split = data.indexOf(0);
      if (new TextDecoder().decode(data.subarray(0, split)) === keyword) {
        return decode(new TextDecoder().decode(data.subarray(split + 1)));
      }
    }
    at += 12 + length;
  }
  return null;
}
