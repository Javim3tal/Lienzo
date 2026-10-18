'use strict';
// Genera build/icon.png (1024×1024) sin dependencias: un lienzo con manchas de color
// y un lápiz sobre fondo degradado. electron-builder lo convierte en el .icns de macOS.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const S = 1024;
const SUB = 3; // submuestreo para suavizar bordes

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

const TOP = hex('#4f8df7');
const BOTTOM = hex('#6d4bd8');
const DOTS = [
  { x: 420, y: 410, r: 62, c: hex('#ef4444') },
  { x: 604, y: 410, r: 62, c: hex('#f5b301') },
  { x: 420, y: 548, r: 62, c: hex('#10b981') },
  { x: 604, y: 548, r: 62, c: hex('#0ea5e9') },
];

function inRoundRect(x, y, cx, cy, hw, hh, r) {
  const qx = Math.abs(x - cx) - hw + r;
  const qy = Math.abs(y - cy) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r <= 0;
}

// Lápiz en diagonal: u avanza de la goma (negativo) a la punta (positivo).
const PC = { x: 690, y: 650 };
const DIR = [-Math.SQRT1_2, Math.SQRT1_2];
function pencil(x, y) {
  const dx = x - PC.x;
  const dy = y - PC.y;
  const u = dx * DIR[0] + dy * DIR[1];
  const v = -dx * DIR[1] + dy * DIR[0];
  const hw = 36;
  if (u >= -215 && u < -180 && Math.abs(v) <= hw) return hex('#f472b6');
  if (u >= -180 && u < -165 && Math.abs(v) <= hw) return hex('#cbd5e1');
  if (u >= -165 && u <= 170 && Math.abs(v) <= hw) return v < -12 ? hex('#fcd34d') : v > 12 ? hex('#d97706') : hex('#fbbf24');
  if (u > 170 && u <= 250) {
    const half = hw * (250 - u) / 80;
    if (Math.abs(v) <= half) return u > 222 ? hex('#334155') : hex('#f3d9a4');
  }
  return null;
}

function sample(x, y) {
  if (!inRoundRect(x, y, 512, 512, 412, 412, 185)) return null;
  let c = mix(TOP, BOTTOM, (y - 100) / 824);
  if (inRoundRect(x, y - 18, 512, 470, 270, 210, 30)) c = mix(c, [0, 0, 0], 0.2);
  if (inRoundRect(x, y, 512, 470, 270, 210, 30)) c = [255, 255, 255];
  for (const d of DOTS) if ((x - d.x) ** 2 + (y - d.y) ** 2 <= d.r * d.r) c = d.c;
  const p = pencil(x, y);
  if (p) c = p;
  return c;
}

const rgba = Buffer.alloc(S * S * 4);
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let sy = 0; sy < SUB; sy++) {
      for (let sx = 0; sx < SUB; sx++) {
        const c = sample(x + (sx + 0.5) / SUB, y + (sy + 0.5) / SUB);
        if (c) { r += c[0]; g += c[1]; b += c[2]; n++; }
      }
    }
    const o = (y * S + x) * 4;
    if (n) {
      rgba[o] = Math.round(r / n);
      rgba[o + 1] = Math.round(g / n);
      rgba[o + 2] = Math.round(b / n);
      rgba[o + 3] = Math.round(255 * n / (SUB * SUB));
    }
  }
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8;  // bits por canal
ihdr[9] = 6;  // RGBA
const raw = Buffer.alloc((S * 4 + 1) * S);
for (let y = 0; y < S; y++) rgba.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = path.join(__dirname, '..', 'build', 'icon.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, png);
console.log(`Icono generado: ${out}`);
