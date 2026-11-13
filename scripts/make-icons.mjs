// Writes the home-screen PNG icons (gold square, dark garage glyph) with no image dependencies.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const BG = [0xe8, 0xb8, 0x4b];
const FG = [0x0d, 0x0d, 0x0f];
// Garage: roof peak + door outline + door slats
const SEGMENTS = [
  [[0.20, 0.47], [0.50, 0.25]], [[0.50, 0.25], [0.80, 0.47]],
  [[0.30, 0.50], [0.30, 0.76]], [[0.70, 0.50], [0.70, 0.76]], [[0.30, 0.50], [0.70, 0.50]],
  [[0.30, 0.59], [0.70, 0.59]], [[0.30, 0.68], [0.70, 0.68]],
];

function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function distToSegment(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function png(size) {
  const half = 0.03 * size;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0;
    for (let x = 0; x < size; x++) {
      const px = (x + 0.5) / size, py = (y + 0.5) / size;
      const d = Math.min(...SEGMENTS.map(([a, b]) => distToSegment(px, py, a, b))) * size;
      const a = Math.max(0, Math.min(1, half - d + 0.5));
      for (let c = 0; c < 3; c++) raw[o++] = Math.round(BG[c] * (1 - a) + FG[c] * a);
      raw[o++] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const dir = new URL('../public/icons/', import.meta.url);
mkdirSync(dir, { recursive: true });
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  writeFileSync(new URL(name, dir), png(size));
  console.log(`wrote public/icons/${name}`);
}
