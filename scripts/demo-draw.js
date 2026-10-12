/**
 * Tiny pictures for the demo class: whiteboard working and atom posters.
 *
 * A whiteboard is sent as a PNG data URL, so the demo needs real PNGs. This
 * draws them with no dependencies: a pixel buffer, a 3x5 block font (enough
 * for "6 + 6 = 12" and short words), discs and rings, then Node's zlib to
 * encode the PNG. Blocky on purpose — it reads like a mouse-drawn board.
 */
const zlib = require('zlib');

/* 3x5 glyphs, one string per row. Lowercase is drawn as uppercase. */
const FONT = {
  0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'],
  2: ['111', '001', '111', '100', '111'], 3: ['111', '001', '111', '001', '111'],
  4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '001', '001', '001'],
  8: ['111', '101', '111', '101', '111'], 9: ['111', '101', '111', '001', '111'],
  A: ['010', '101', '111', '101', '101'], B: ['110', '101', '110', '101', '110'],
  C: ['011', '100', '100', '100', '011'], D: ['110', '101', '101', '101', '110'],
  E: ['111', '100', '110', '100', '111'], F: ['111', '100', '110', '100', '100'],
  G: ['011', '100', '101', '101', '011'], H: ['101', '101', '111', '101', '101'],
  I: ['111', '010', '010', '010', '111'], J: ['001', '001', '001', '101', '010'],
  K: ['101', '101', '110', '101', '101'], L: ['100', '100', '100', '100', '111'],
  M: ['101', '111', '111', '101', '101'], N: ['110', '101', '101', '101', '101'],
  O: ['010', '101', '101', '101', '010'], P: ['110', '101', '110', '100', '100'],
  Q: ['010', '101', '101', '110', '011'], R: ['110', '101', '110', '101', '101'],
  S: ['011', '100', '010', '001', '110'], T: ['111', '010', '010', '010', '010'],
  U: ['101', '101', '101', '101', '111'], V: ['101', '101', '101', '101', '010'],
  W: ['101', '101', '111', '111', '101'], X: ['101', '101', '010', '101', '101'],
  Y: ['101', '101', '010', '010', '010'], Z: ['111', '001', '010', '100', '111'],
  '=': ['000', '111', '000', '111', '000'], '+': ['000', '010', '111', '010', '000'],
  '-': ['000', '000', '111', '000', '000'], '/': ['001', '001', '010', '100', '100'],
  '.': ['000', '000', '000', '000', '010'], ':': ['000', '010', '000', '010', '000'],
  '(': ['010', '100', '100', '100', '010'], ')': ['010', '001', '001', '001', '010'],
  '>': ['100', '010', '001', '010', '100'], '?': ['111', '001', '010', '000', '010'],
  ' ': ['000', '000', '000', '000', '000'],
};

const INK = [32, 52, 110];
const RED = [196, 60, 60];
const GREY = [150, 160, 175];

class Canvas {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.px = Buffer.alloc(w * h * 3, 255); // white
  }

  dot(x, y, c) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 3;
    this.px[i] = c[0]; this.px[i + 1] = c[1]; this.px[i + 2] = c[2];
  }

  rect(x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.dot(x + i, y + j, c);
  }

  disc(cx, cy, r, c) {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) this.dot(cx + x, cy + y, c);
  }

  ring(cx, cy, r, thick, c) {
    const lo = (r - thick) * (r - thick);
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      const d = x * x + y * y;
      if (d <= r * r && d >= lo) this.dot(cx + x, cy + y, c);
    }
  }

  /** Block text. `wobble` nudges each letter a pixel or two, like a hand would. */
  text(str, x, y, scale, c, wobble = 1) {
    let cx = x;
    [...String(str).toUpperCase()].forEach((ch, n) => {
      const g = FONT[ch] || FONT['?'];
      const dy = wobble ? ((n * 7) % 3) - 1 : 0;
      g.forEach((row, ry) => [...row].forEach((bit, rx) => {
        if (bit === '1') this.rect(cx + rx * scale, y + dy + ry * scale, scale, scale, c);
      }));
      cx += 4 * scale;
    });
    return cx;
  }

  toPngDataUrl() {
    const { w, h, px } = this;
    const raw = Buffer.alloc((w * 3 + 1) * h);
    for (let y = 0; y < h; y++) {
      raw[y * (w * 3 + 1)] = 0; // filter: none
      px.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0);
    ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
    const png = Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', ihdr),
      chunk('IDAT', zlib.deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0)),
    ]);
    return 'data:image/png;base64,' + png.toString('base64');
  }
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** A whiteboard of working: one line of text per entry, a mistake crossed out. */
function workingBoard(lines, { crossOut } = {}) {
  const cv = new Canvas(520, 60 + lines.length * 52);
  lines.forEach((line, i) => {
    const y = 30 + i * 52;
    const end = cv.text(line, 28, y, 6, INK);
    if (crossOut === i) cv.rect(22, y + 12, end - 22, 4, RED);
  });
  return cv.toPngDataUrl();
}

/**
 * An atom drawing. `good` decides whether the electrons are on the rings
 * (right) or packed into the middle (a common wrong picture).
 */
function atomBoard({ good = true, labels = true, electrons = 6 } = {}) {
  const cv = new Canvas(420, 300);
  const cx = 170, cy = 150;
  cv.ring(cx, cy, 110, 3, GREY);
  cv.ring(cx, cy, 70, 3, GREY);
  cv.disc(cx, cy, 30, RED);
  if (good) {
    for (let i = 0; i < electrons; i++) {
      const r = i < 2 ? 70 : 110;
      const a = (i < 2 ? i * Math.PI : (i - 2) * (Math.PI / 2)) + 0.4;
      cv.disc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 9, INK);
    }
  } else {
    for (let i = 0; i < electrons; i++) cv.disc(cx - 15 + (i % 3) * 15, cy - 8 + Math.floor(i / 3) * 16, 6, INK);
  }
  if (labels) {
    cv.text('P+ N', 300, 120, 5, RED);
    cv.text('E-', 300, 170, 5, INK);
  }
  return cv.toPngDataUrl();
}

module.exports = { workingBoard, atomBoard };
