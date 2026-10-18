'use strict';
/* Lienzo: editor de dibujo.
   Todo se dibuja en un <canvas> con los píxeles reales del documento; el zoom solo
   escala la vista. Encima hay un segundo canvas (overlay) para vistas previas de
   formas, trazos en curso y la selección flotante. */

const api = window.lienzo || null;
const isMac = api ? api.platform === 'darwin' : /Mac/.test(navigator.platform);
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const canvas = $('#canvas');
const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
const overlay = $('#overlay');
const octx = overlay.getContext('2d');
const stage = $('#stage');
const workspace = $('#workspace');
const selbox = $('#selbox');
const textInput = $('#textInput');
const cursorBox = $('#cursorBox');

const DEFAULT_W = 1000;
const DEFAULT_H = 640;
const MAX_UNDO = 30;
const WRITABLE = ['png', 'jpg', 'jpeg', 'bmp', 'webp'];
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', bmp: 'image/bmp' };
const ZOOMS = [0.125, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 12, 16];
const ZOOM_MIN = 0.05;
const ZOOM_MAX = 16;
const SIZE_PRESETS = [1, 3, 5, 8, 12, 20];
const FONTS = ['Helvetica Neue', 'Arial', 'Avenir Next', 'Futura', 'Gill Sans', 'Georgia', 'Times New Roman',
  'Palatino', 'Courier New', 'Menlo', 'Verdana', 'Trebuchet MS', 'Comic Sans MS', 'Impact', 'Marker Felt', 'Chalkboard SE'];
const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72, 96, 120];

const PALETTE = [
  '#000000', '#7f7f7f', '#880015', '#ed1c24', '#ff7f27', '#fff200', '#22b14c', '#00a2e8', '#3f48cc', '#a349a4',
  '#ffffff', '#c3c3c3', '#b97a57', '#ffaec9', '#ffc90e', '#efe4b0', '#b5e61d', '#99d9ea', '#7092be', '#c8bfe7',
];

const SHAPES = [
  ['line', 'Línea'], ['curve', 'Curva'], ['oval', 'Óvalo'], ['rect', 'Rectángulo'],
  ['roundrect', 'Rectángulo redondeado'], ['polygon', 'Polígono'], ['triangle', 'Triángulo'],
  ['righttriangle', 'Triángulo rectángulo'], ['diamond', 'Rombo'], ['pentagon', 'Pentágono'],
  ['hexagon', 'Hexágono'], ['arrowRight', 'Flecha derecha'], ['arrowLeft', 'Flecha izquierda'],
  ['arrowUp', 'Flecha arriba'], ['arrowDown', 'Flecha abajo'], ['star4', 'Estrella de cuatro puntas'],
  ['star5', 'Estrella de cinco puntas'], ['star6', 'Estrella de seis puntas'], ['heart', 'Corazón'],
  ['lightning', 'Rayo'],
];

const ICONS = {
  new: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
  open: '<path d="M3 6h6l2 2h10v11H3z"/>',
  save: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7V3"/><rect x="8" y="13" width="8" height="8"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 000 12h3"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 114 2c-1 .7-1.5 1.2-1.5 2.5"/><path d="M12 17.5v.01"/>',
  select: '<rect x="4" y="4" width="16" height="16" stroke-dasharray="3 2.5"/>',
  lasso: '<path d="M6 16C3 12 5 5 12 5s8 5 5 9-7 2-9 3-1 3 0 4" stroke-dasharray="3 2.5"/>',
  crop: '<path d="M7 3v14h14"/><path d="M3 7h14v14"/>',
  resize: '<rect x="3" y="11" width="10" height="10"/><path d="M14 3h7v7"/><path d="M21 3l-8 8"/>',
  rotate: '<path d="M20 12a8 8 0 11-2.6-5.9"/><path d="M20 4v5h-5"/>',
  pencil: '<path d="M4 20l1.2-4.8L16 4.4 19.6 8 8.8 18.8z"/><path d="M14 6.5l3.5 3.5"/>',
  fill: '<path d="M4.5 11.5L11 5l7 7-6.5 6.5a2 2 0 01-2.8 0L4.5 14.3a2 2 0 010-2.8z"/><path d="M4 12h14"/><path d="M20.5 15s1.8 2.3 1.8 3.6a1.8 1.8 0 01-3.6 0c0-1.3 1.8-3.6 1.8-3.6z"/>',
  text: '<path d="M5 5h14"/><path d="M12 5v14"/><path d="M9 19h6"/>',
  eraser: '<path d="M8 20l-4-4L15 5l5 5-9 10z"/><path d="M9.5 9.5l5 5"/><path d="M8 20h12"/>',
  picker: '<path d="M14.5 3.5l6 6-2.5 2.5-6-6z"/><path d="M13.5 7.5L5 16l-1 4 4-1 8.5-8.5"/>',
  zoom: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L20 20"/><path d="M8 10.5h5M10.5 8v5"/>',
  brush: '<path d="M18.5 3.5l2 2-8 9-3-3z"/><path d="M9.5 11.5c-3 0-5 2-5 5 0 1.5-.5 3-1.5 3.5 3 1 8 0 9.5-3.5"/>',
  swap: '<path d="M7 4L4 7l3 3"/><path d="M4 7h11a4 4 0 014 4"/><path d="M17 20l3-3-3-3"/><path d="M20 17H9a4 4 0 01-4-4"/>',
  palette: '<path d="M12 3a9 9 0 100 18c1.4 0 2-1 1.6-2.2-.4-1.3.5-2.8 2-2.8H18a3 3 0 003-3c0-5.5-4-10-9-10z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10.5" cy="7" r="1.2"/><circle cx="15" cy="7.5" r="1.2"/>',
  fit: '<path d="M4 9V4h5"/><path d="M20 9V4h-5"/><path d="M4 15v5h5"/><path d="M20 15v5h-5"/>',
  minus: '<path d="M5 12h14"/>',
  plus: '<path d="M5 12h14M12 5v14"/>',
};

const state = {
  tool: 'pencil',
  prevTool: 'pencil',
  brush: 'brush',
  shape: 'rect',
  outline: 'solid',
  fill: 'none',
  sizes: { pencil: 1, brush: 5, eraser: 10, shape: 3 },
  primary: '#000000',
  secondary: '#ffffff',
  zoom: 1,
  fileName: null,
  filePath: null,
  dirty: false,
  selectMode: 'rect',
  transparentSel: false,
  font: 'Helvetica Neue',
  fontSize: 24,
  bold: false,
  italic: false,
  underline: false,
  textOpaque: false,
  custom: [],
};

let sel = null;    // selección: {x, y, w, h, canvas, path, lifted, version}
let drag = null;   // arrastre en curso de la herramienta activa
let curve = null;  // curva en construcción
let poly = null;   // polígono en construcción
let text = null;   // cuadro de texto activo {x, y, w, h}
let airTimer = null;
let modalOk = null;
const undoStack = [];
const redoStack = [];

/* ---------- utilidades ---------- */

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function rgbToHex(r, g, b) {
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}
function copyCanvas(src) {
  const c = makeCanvas(src.width, src.height);
  c.getContext('2d').drawImage(src, 0, 0);
  return c;
}
function extOf(p) {
  const m = /\.([^./\\]+)$/.exec(p || '');
  return m ? m[1].toLowerCase() : '';
}
function baseName(p) {
  return String(p).split(/[\\/]/).pop();
}
function loadImg(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}
function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function svg(name) {
  return `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}
function rectFrom(a, b) {
  const x = Math.floor(Math.min(a.x, b.x));
  const y = Math.floor(Math.min(a.y, b.y));
  return { x, y, w: Math.ceil(Math.max(a.x, b.x)) - x, h: Math.ceil(Math.max(a.y, b.y)) - y };
}
function clampRect(r) {
  const x = clamp(r.x, 0, canvas.width);
  const y = clamp(r.y, 0, canvas.height);
  return { x, y, w: clamp(r.x + r.w, 0, canvas.width) - x, h: clamp(r.y + r.h, 0, canvas.height) - y };
}
function clampPt(p) {
  return { x: clamp(p.x, 0, canvas.width), y: clamp(p.y, 0, canvas.height) };
}
function constrainSquare(a, p) {
  const dx = p.x - a.x;
  const dy = p.y - a.y;
  const s = Math.max(Math.abs(dx), Math.abs(dy));
  return { x: a.x + Math.sign(dx || 1) * s, y: a.y + Math.sign(dy || 1) * s };
}
function constrainLine(a, p, shift) {
  if (!shift) return p;
  const step = Math.PI / 4;
  const ang = Math.round(Math.atan2(p.y - a.y, p.x - a.x) / step) * step;
  const len = dist(a, p);
  return { x: a.x + Math.cos(ang) * len, y: a.y + Math.sin(ang) * len };
}
// En Mac, ctrl+clic equivale al clic derecho (usa el color 2).
const btnOf = (e) => (e.button === 2 || (isMac && e.ctrlKey) ? 2 : 0);
const colorsFor = (e) => (btnOf(e) === 2 ? [state.secondary, state.primary] : [state.primary, state.secondary]);

/* ---------- lienzo, vista y zoom ---------- */

function setCanvasSize(w, h, keep = true) {
  w = clamp(Math.round(w), 1, 12000);
  h = clamp(Math.round(h), 1, 12000);
  const old = keep ? copyCanvas(canvas) : null;
  canvas.width = w;
  canvas.height = h;
  overlay.width = w;
  overlay.height = h;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  if (old) ctx.drawImage(old, 0, 0);
  updateStage();
  renderOverlay();
}

function updateStage() {
  const z = state.zoom;
  stage.style.width = canvas.width * z + 'px';
  stage.style.height = canvas.height * z + 'px';
  const rendering = z >= 2 ? 'pixelated' : 'auto';
  canvas.style.imageRendering = rendering;
  overlay.style.imageRendering = rendering;
  positionSelbox();
  positionText();
  updateStatus();
}

function toDoc(cx, cy) {
  const r = canvas.getBoundingClientRect();
  return { x: (cx - r.left) * canvas.width / r.width, y: (cy - r.top) * canvas.height / r.height };
}

function setZoom(z, client) {
  z = clamp(z, ZOOM_MIN, ZOOM_MAX);
  if (Math.abs(z - state.zoom) < 1e-6) return;
  const ws = workspace.getBoundingClientRect();
  const c = client || { x: ws.left + ws.width / 2, y: ws.top + ws.height / 2 };
  const p = toDoc(c.x, c.y);
  state.zoom = z;
  updateStage();
  const r = canvas.getBoundingClientRect();
  workspace.scrollLeft += r.left + p.x * z - c.x;
  workspace.scrollTop += r.top + p.y * z - c.y;
}

function zoomStep(dir, client) {
  const z = state.zoom;
  const next = dir > 0 ? ZOOMS.find((v) => v > z + 1e-6) : [...ZOOMS].reverse().find((v) => v < z - 1e-6);
  if (next) setZoom(next, client);
}

function zoomFit() {
  const w = workspace.clientWidth - 48;
  const h = workspace.clientHeight - 48;
  setZoom(clamp(Math.min(w / canvas.width, h / canvas.height), ZOOM_MIN, 4));
}

function fitIfNeeded() {
  const w = workspace.clientWidth - 48;
  const h = workspace.clientHeight - 48;
  if (canvas.width > w || canvas.height > h) zoomFit();
  else setZoom(1);
  updateStage();
}

const zoomToRange = (z) => 100 * Math.log(z / ZOOM_MIN) / Math.log(ZOOM_MAX / ZOOM_MIN);
const rangeToZoom = (v) => ZOOM_MIN * Math.pow(ZOOM_MAX / ZOOM_MIN, v / 100);

/* ---------- historial (deshacer/rehacer) ---------- */

function snapshot() {
  return { w: canvas.width, h: canvas.height, data: ctx.getImageData(0, 0, canvas.width, canvas.height) };
}
function pushUndo() {
  undoStack.push(snapshot());
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack.length = 0;
  markDirty();
  updateUndoUI();
}
function restoreSnap(s) {
  canvas.width = s.w;
  canvas.height = s.h;
  overlay.width = s.w;
  overlay.height = s.h;
  ctx.putImageData(s.data, 0, 0);
  updateStage();
  renderOverlay();
}
// Descarta lo que está a medio hacer (selección flotante, texto, curva o polígono).
function cancelTransient() {
  sel = null;
  drag = null;
  curve = null;
  poly = null;
  cancelText();
  renderOverlay();
}
function undo() {
  cancelTransient();
  if (!undoStack.length) return;
  redoStack.push(snapshot());
  restoreSnap(undoStack.pop());
  markDirty();
  updateUndoUI();
}
function redo() {
  cancelTransient();
  if (!redoStack.length) return;
  undoStack.push(snapshot());
  restoreSnap(redoStack.pop());
  markDirty();
  updateUndoUI();
}
function updateUndoUI() {
  $('#undoBtn').disabled = !undoStack.length;
  $('#redoBtn').disabled = !redoStack.length;
}

/* ---------- capa superpuesta y selección ---------- */

function renderOverlay() {
  octx.clearRect(0, 0, overlay.width, overlay.height);
  if (sel && sel.lifted) octx.drawImage(selSource(), sel.x, sel.y);
  positionSelbox();
}

// Con «selección transparente», los píxeles del color 2 no se copian.
function selSource() {
  if (!state.transparentSel) return sel.canvas;
  const key = state.secondary + ':' + sel.version;
  if (sel.tkey !== key) {
    const c = copyCanvas(sel.canvas);
    const g = c.getContext('2d');
    const img = g.getImageData(0, 0, c.width, c.height);
    const bg = hexToRgb(state.secondary);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] === bg.r && d[i + 1] === bg.g && d[i + 2] === bg.b) d[i + 3] = 0;
    }
    g.putImageData(img, 0, 0);
    sel.tcache = c;
    sel.tkey = key;
  }
  return sel.tcache;
}

function positionSelbox(rect) {
  const r = rect || sel;
  if (!r) { selbox.hidden = true; return; }
  const z = state.zoom;
  selbox.style.left = r.x * z + 'px';
  selbox.style.top = r.y * z + 'px';
  selbox.style.width = Math.max(1, r.w * z) + 2 + 'px';
  selbox.style.height = Math.max(1, r.h * z) + 2 + 'px';
  selbox.hidden = false;
}

function makeSelection(x, y, w, h, pts) {
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  g.drawImage(canvas, x, y, w, h, 0, 0, w, h);
  let path = null;
  if (pts) {
    path = new Path2D();
    pts.forEach((p, i) => (i ? path.lineTo(p.x, p.y) : path.moveTo(p.x, p.y)));
    path.closePath();
    const local = new Path2D();
    local.addPath(path, new DOMMatrix().translate(-x, -y));
    g.globalCompositeOperation = 'destination-in';
    g.fill(local);
  }
  sel = { x, y, w, h, canvas: c, path, lifted: false, version: 0 };
  renderOverlay();
  updateStatus();
}

// Separa la selección del lienzo para poder moverla o transformarla.
function liftSelection(clear = true) {
  if (!sel || sel.lifted) return;
  pushUndo();
  if (clear) {
    ctx.fillStyle = state.secondary;
    if (sel.path) ctx.fill(sel.path);
    else ctx.fillRect(sel.x, sel.y, sel.w, sel.h);
  }
  sel.lifted = true;
  renderOverlay();
}

function commitSelection() {
  if (!sel) return;
  if (sel.lifted) ctx.drawImage(selSource(), sel.x, sel.y);
  sel = null;
  renderOverlay();
  updateStatus();
}

function deleteSelection() {
  if (!sel) return;
  if (!sel.lifted) liftSelection(true);
  sel = null;
  renderOverlay();
  updateStatus();
}

function selectAll() {
  commitText();
  finishShape();
  setTool('select');
  commitSelection();
  makeSelection(0, 0, canvas.width, canvas.height);
}

function hitSel(p) {
  return sel && p.x >= sel.x && p.y >= sel.y && p.x <= sel.x + sel.w && p.y <= sel.y + sel.h;
}

function commitAll() {
  commitText();
  finishShape();
  commitSelection();
}

/* ---------- transformaciones de imagen ---------- */

function rotated(c, deg) {
  const swap = deg % 180 !== 0;
  const o = makeCanvas(swap ? c.height : c.width, swap ? c.width : c.height);
  const g = o.getContext('2d');
  g.translate(o.width / 2, o.height / 2);
  g.rotate(deg * Math.PI / 180);
  g.drawImage(c, -c.width / 2, -c.height / 2);
  return o;
}
function flipped(c, horizontal) {
  const o = makeCanvas(c.width, c.height);
  const g = o.getContext('2d');
  if (horizontal) { g.translate(c.width, 0); g.scale(-1, 1); } else { g.translate(0, c.height); g.scale(1, -1); }
  g.drawImage(c, 0, 0);
  return o;
}
function inverted(c) {
  const o = copyCanvas(c);
  const g = o.getContext('2d');
  const img = g.getImageData(0, 0, o.width, o.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = 255 - d[i];
    d[i + 1] = 255 - d[i + 1];
    d[i + 2] = 255 - d[i + 2];
  }
  g.putImageData(img, 0, 0);
  return o;
}
function resizedSkewed(c, nw, nh, skewX, skewY) {
  const s = makeCanvas(nw, nh);
  const sg = s.getContext('2d');
  sg.imageSmoothingQuality = 'high';
  sg.drawImage(c, 0, 0, s.width, s.height);
  const tx = Math.tan(skewX * Math.PI / 180);
  const ty = Math.tan(skewY * Math.PI / 180);
  if (!tx && !ty) return s;
  const o = makeCanvas(s.width + Math.abs(s.height * tx), s.height + Math.abs(s.width * ty));
  const g = o.getContext('2d');
  g.setTransform(1, ty, tx, 1, tx < 0 ? -s.height * tx : 0, ty < 0 ? -s.width * ty : 0);
  g.drawImage(s, 0, 0);
  return o;
}

// Aplica una transformación a la selección o, si no hay, a toda la imagen.
function transformImage(fn) {
  commitText();
  finishShape();
  if (sel) {
    liftSelection(true);
    sel.canvas = fn(sel.canvas);
    sel.w = sel.canvas.width;
    sel.h = sel.canvas.height;
    sel.path = null;
    sel.version++;
    markDirty();
    renderOverlay();
    updateStatus();
    return;
  }
  pushUndo();
  const out = fn(copyCanvas(canvas));
  setCanvasSize(out.width, out.height, false);
  ctx.drawImage(out, 0, 0);
}

function crop() {
  if (!sel) return;
  commitText();
  const src = sel.canvas;
  if (!sel.lifted) pushUndo();
  sel = null;
  setCanvasSize(src.width, src.height, false);
  ctx.drawImage(src, 0, 0);
  renderOverlay();
}

function clearImage() {
  commitText();
  finishShape();
  if (sel) { deleteSelection(); return; }
  pushUndo();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

/* ---------- dibujo a mano alzada ---------- */

function stampLine(g, a, b, size, color) {
  g.fillStyle = color;
  const off = Math.floor(size / 2);
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y))));
  for (let i = 0; i <= n; i++) {
    const x = Math.floor(a.x + (b.x - a.x) * i / n);
    const y = Math.floor(a.y + (b.y - a.y) * i / n);
    g.fillRect(x - off, y - off, size, size);
  }
}

function drawBrushPath() {
  const { pts, color, size, kind } = drag;
  octx.clearRect(0, 0, overlay.width, overlay.height);
  octx.strokeStyle = color;
  octx.fillStyle = color;
  octx.lineWidth = size;
  octx.lineCap = kind === 'marker' ? 'square' : 'round';
  octx.lineJoin = 'round';
  if (pts.length === 1) {
    const p = pts[0];
    if (kind === 'marker') octx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
    else { octx.beginPath(); octx.arc(p.x, p.y, size / 2, 0, Math.PI * 2); octx.fill(); }
    return;
  }
  octx.beginPath();
  octx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    octx.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
  }
  const last = pts[pts.length - 1];
  octx.lineTo(last.x, last.y);
  octx.stroke();
}

function calligraphySeg(a, b) {
  const s = Math.max(2, drag.size * 1.5);
  const ang = drag.kind === 'calli1' ? -Math.PI / 4 : Math.PI / 4;
  const nx = Math.cos(ang) * s / 2;
  const ny = Math.sin(ang) * s / 2;
  ctx.fillStyle = drag.color;
  ctx.strokeStyle = drag.color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(a.x - nx, a.y - ny);
  ctx.lineTo(a.x + nx, a.y + ny);
  ctx.lineTo(b.x + nx, b.y + ny);
  ctx.lineTo(b.x - nx, b.y - ny);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function spray(p) {
  const radius = Math.max(4, drag.size * 2);
  const count = Math.ceil(radius * 0.7);
  ctx.fillStyle = drag.color;
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = radius * Math.sqrt(Math.random());
    ctx.fillRect(Math.floor(p.x + Math.cos(a) * r), Math.floor(p.y + Math.sin(a) * r), 1, 1);
  }
}

function floodFill(sx, sy, hex) {
  const w = canvas.width;
  const h = canvas.height;
  const img = ctx.getImageData(0, 0, w, h);
  const d = new Uint32Array(img.data.buffer);
  const { r, g, b } = hexToRgb(hex);
  const fill = ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
  const target = d[sy * w + sx];
  if (target === fill) return;
  pushUndo();
  const stack = [sx, sy];
  while (stack.length) {
    const y = stack.pop();
    let x = stack.pop();
    let i = y * w + x;
    while (x > 0 && d[i - 1] === target) { x--; i--; }
    let up = false;
    let down = false;
    while (x < w && d[i] === target) {
      d[i] = fill;
      if (y > 0) {
        const t = d[i - w] === target;
        if (t && !up) { stack.push(x, y - 1); up = true; } else if (!t) up = false;
      }
      if (y < h - 1) {
        const t = d[i + w] === target;
        if (t && !down) { stack.push(x, y + 1); down = true; } else if (!t) down = false;
      }
      x++;
      i++;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/* ---------- formas ---------- */

function regular(n) {
  return Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + i * 2 * Math.PI / n;
    return [Math.cos(a), Math.sin(a)];
  });
}
function star(n, inner) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + i * Math.PI / n;
    const r = i % 2 ? inner : 1;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return pts;
}
const ARROW = [[0, 0.3], [0.6, 0.3], [0.6, 0], [1, 0.5], [0.6, 1], [0.6, 0.7], [0, 0.7]];
const UNIT_SHAPES = {
  triangle: [[0.5, 0], [1, 1], [0, 1]],
  righttriangle: [[0, 0], [1, 1], [0, 1]],
  diamond: [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]],
  pentagon: regular(5),
  hexagon: regular(6),
  arrowRight: ARROW,
  arrowLeft: ARROW.map(([u, v]) => [1 - u, v]),
  arrowDown: ARROW.map(([u, v]) => [v, u]),
  arrowUp: ARROW.map(([u, v]) => [v, 1 - u]),
  star4: star(4, 0.38),
  star5: star(5, 0.4),
  star6: star(6, 0.55),
  lightning: [[0.38, 0], [0.68, 0], [0.52, 0.36], [0.8, 0.36], [0.3, 1], [0.42, 0.56], [0.18, 0.56]],
};

function fitPolygon(path, pts, x, y, w, h) {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX || 1;
  const spanY = Math.max(...ys) - minY || 1;
  pts.forEach(([u, v], i) => {
    const px = x + (u - minX) / spanX * w;
    const py = y + (v - minY) / spanY * h;
    if (i) path.lineTo(px, py); else path.moveTo(px, py);
  });
  path.closePath();
}

function shapePath(type, x1, y1, x2, y2) {
  const p = new Path2D();
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  const w = Math.abs(x2 - x1);
  const h = Math.abs(y2 - y1);
  switch (type) {
    case 'rect': p.rect(x, y, w, h); break;
    case 'roundrect': p.roundRect(x, y, w, h, Math.min(w, h) * 0.2); break;
    case 'oval': p.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); break;
    case 'heart': {
      const X = (u) => x + u * w;
      const Y = (v) => y + v * h;
      p.moveTo(X(0.5), Y(1));
      p.bezierCurveTo(X(0.2), Y(0.78), X(0), Y(0.56), X(0), Y(0.3));
      p.bezierCurveTo(X(0), Y(0.12), X(0.14), Y(0), X(0.29), Y(0));
      p.bezierCurveTo(X(0.41), Y(0), X(0.49), Y(0.08), X(0.5), Y(0.2));
      p.bezierCurveTo(X(0.51), Y(0.08), X(0.59), Y(0), X(0.71), Y(0));
      p.bezierCurveTo(X(0.86), Y(0), X(1), Y(0.12), X(1), Y(0.3));
      p.bezierCurveTo(X(1), Y(0.56), X(0.8), Y(0.78), X(0.5), Y(1));
      p.closePath();
      break;
    }
    default: fitPolygon(p, UNIT_SHAPES[type] || UNIT_SHAPES.triangle, x, y, w, h);
  }
  return p;
}

function shapeColors(btn) {
  return btn === 2 ? { stroke: state.secondary, fill: state.primary } : { stroke: state.primary, fill: state.secondary };
}

function drawShape(g, type, a, b, btn) {
  const { stroke, fill } = shapeColors(btn);
  const lw = state.sizes.shape;
  const A = { x: Math.floor(a.x), y: Math.floor(a.y) };
  const B = { x: Math.floor(b.x), y: Math.floor(b.y) };
  g.save();
  if (lw % 2 === 1) g.translate(0.5, 0.5);
  g.lineWidth = lw;
  g.strokeStyle = stroke;
  if (type === 'line') {
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(A.x, A.y);
    g.lineTo(B.x, B.y);
    g.stroke();
  } else {
    const path = shapePath(type, A.x, A.y, B.x, B.y);
    if (state.fill === 'solid') { g.fillStyle = fill; g.fill(path); }
    if (state.outline === 'solid' || state.fill === 'none') {
      g.lineJoin = type === 'heart' || type === 'oval' ? 'round' : 'miter';
      g.stroke(path);
    }
  }
  g.restore();
}

function drawCurve(g, c) {
  g.save();
  g.strokeStyle = shapeColors(c.btn).stroke;
  g.lineWidth = state.sizes.shape;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(c.a.x, c.a.y);
  if (c.c1) g.bezierCurveTo(c.c1.x, c.c1.y, c.c2.x, c.c2.y, c.b.x, c.b.y);
  else g.lineTo(c.b.x, c.b.y);
  g.stroke();
  g.restore();
}

function drawPoly(g, pl, closed) {
  const { stroke, fill } = shapeColors(pl.btn);
  const path = new Path2D();
  pl.pts.forEach((q, i) => (i ? path.lineTo(q.x, q.y) : path.moveTo(q.x, q.y)));
  if (closed) path.closePath();
  g.save();
  g.lineJoin = 'round';
  g.lineCap = 'round';
  if (closed && state.fill === 'solid') { g.fillStyle = fill; g.fill(path); }
  if (!closed || state.outline === 'solid' || state.fill === 'none') {
    g.strokeStyle = stroke;
    g.lineWidth = state.sizes.shape;
    g.stroke(path);
  }
  g.restore();
}

function previewShape() {
  renderOverlay();
  if (drag && drag.shape) drawShape(octx, state.shape, drag.a, drag.b, drag.btn);
  if (curve) drawCurve(octx, curve);
  if (poly) drawPoly(octx, { pts: [...poly.pts, poly.cursor], btn: poly.btn }, false);
}

function commitCurve() {
  if (!curve) return;
  const c = curve;
  curve = null;
  if (dist(c.a, c.b) >= 1) { pushUndo(); drawCurve(ctx, c); }
  renderOverlay();
}

function commitPoly() {
  if (!poly) return;
  const pts = poly.pts.filter((p, i, all) => i === 0 || dist(p, all[i - 1]) >= 1);
  const pl = { pts, btn: poly.btn };
  poly = null;
  if (pts.length >= 2) { pushUndo(); drawPoly(ctx, pl, pts.length >= 3); }
  renderOverlay();
}

function finishShape() {
  commitCurve();
  commitPoly();
}

/* ---------- texto ---------- */

function textFont(scale) {
  return `${state.italic ? 'italic ' : ''}${state.bold ? 'bold ' : ''}${state.fontSize * scale}px "${state.font}", sans-serif`;
}

function openText(r) {
  const minH = Math.ceil(state.fontSize * 1.25) + 2;
  text = {
    x: clamp(r.x, 0, canvas.width - 1),
    y: clamp(r.y, 0, canvas.height - 1),
    w: Math.max(r.w, 20),
    h: Math.max(r.h, minH),
  };
  textInput.value = '';
  textInput.hidden = false;
  positionText();
  textInput.focus();
}

function styleText() {
  if (!text) return;
  textInput.style.font = textFont(state.zoom);
  textInput.style.lineHeight = '1.25';
  textInput.style.color = state.primary;
  textInput.style.background = state.textOpaque ? state.secondary : 'transparent';
  textInput.style.textDecoration = state.underline ? 'underline' : 'none';
}

function positionText() {
  if (!text) return;
  const z = state.zoom;
  textInput.style.left = text.x * z + 'px';
  textInput.style.top = text.y * z + 'px';
  textInput.style.width = text.w * z + 'px';
  textInput.style.height = text.h * z + 'px';
  styleText();
}

function growText() {
  if (!text) return;
  const needed = textInput.scrollHeight / state.zoom;
  if (needed > text.h + 0.5) { text.h = Math.ceil(needed); positionText(); }
}

function wrapText(g, value, maxW) {
  const out = [];
  for (const para of value.split('\n')) {
    const tokens = para.match(/\S+\s*/g);
    if (!tokens) { out.push(''); continue; }
    let line = '';
    for (const tk of tokens) {
      const test = line + tk;
      if (line && g.measureText(test.trimEnd()).width > maxW) {
        out.push(line.trimEnd());
        line = tk;
      } else {
        line = test;
      }
      // Palabras más anchas que el cuadro: se cortan por letras.
      while (line.trimEnd().length > 1 && g.measureText(line.trimEnd()).width > maxW) {
        let k = line.length - 1;
        while (k > 1 && g.measureText(line.slice(0, k)).width > maxW) k--;
        out.push(line.slice(0, k));
        line = line.slice(k);
      }
    }
    out.push(line.trimEnd());
  }
  return out;
}

function commitText() {
  if (!text) return;
  const r = text;
  const value = textInput.value;
  cancelText();
  if (!value.trim()) return;
  pushUndo();
  ctx.save();
  ctx.font = textFont(1);
  ctx.textBaseline = 'top';
  const lh = state.fontSize * 1.25;
  const lines = wrapText(ctx, value, r.w);
  const h = Math.max(r.h, lines.length * lh);
  if (state.textOpaque) { ctx.fillStyle = state.secondary; ctx.fillRect(r.x, r.y, r.w, h); }
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, h);
  ctx.clip();
  ctx.fillStyle = state.primary;
  lines.forEach((ln, i) => {
    const y = r.y + i * lh + (lh - state.fontSize) / 2;
    ctx.fillText(ln, r.x, y);
    if (state.underline && ln) {
      const thick = Math.max(1, Math.round(state.fontSize / 16));
      ctx.fillRect(r.x, y + state.fontSize * 0.95, ctx.measureText(ln).width, thick);
    }
  });
  ctx.restore();
}

function cancelText() {
  text = null;
  textInput.hidden = true;
  if (document.activeElement === textInput) textInput.blur();
}

/* ---------- herramientas ---------- */

const TOOLS = {
  pencil: {
    down(p, e) {
      pushUndo();
      drag = { last: p, color: colorsFor(e)[0] };
      stampLine(ctx, p, p, state.sizes.pencil, drag.color);
    },
    move(p) {
      if (!drag) return;
      stampLine(ctx, drag.last, p, state.sizes.pencil, drag.color);
      drag.last = p;
    },
    up() { drag = null; },
  },

  eraser: {
    down(p) {
      pushUndo();
      drag = { last: p };
      stampLine(ctx, p, p, state.sizes.eraser, state.secondary);
    },
    move(p) {
      if (!drag) return;
      stampLine(ctx, drag.last, p, state.sizes.eraser, state.secondary);
      drag.last = p;
    },
    up() { drag = null; },
  },

  brush: {
    down(p, e) {
      pushUndo();
      drag = { pts: [p], last: p, color: colorsFor(e)[0], size: state.sizes.brush, kind: state.brush };
      if (drag.kind === 'airbrush') {
        spray(p);
        airTimer = setInterval(() => drag && spray(drag.last), 30);
      } else if (drag.kind.startsWith('calli')) {
        calligraphySeg(p, p);
      } else {
        overlay.style.opacity = drag.kind === 'marker' ? '0.45' : '1';
        drawBrushPath();
      }
    },
    move(p) {
      if (!drag) return;
      if (drag.kind === 'airbrush') { drag.last = p; spray(p); }
      else if (drag.kind.startsWith('calli')) { calligraphySeg(drag.last, p); drag.last = p; }
      else { drag.pts.push(p); drawBrushPath(); }
    },
    up() {
      if (!drag) return;
      clearInterval(airTimer);
      airTimer = null;
      if (drag.kind === 'brush' || drag.kind === 'marker') {
        ctx.globalAlpha = drag.kind === 'marker' ? 0.45 : 1;
        ctx.drawImage(overlay, 0, 0);
        ctx.globalAlpha = 1;
        overlay.style.opacity = '1';
      }
      drag = null;
      renderOverlay();
    },
  },

  fill: {
    down(p, e) {
      const x = Math.floor(p.x);
      const y = Math.floor(p.y);
      if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
      floodFill(x, y, colorsFor(e)[0]);
    },
  },

  picker: {
    down(p, e) {
      const x = clamp(Math.floor(p.x), 0, canvas.width - 1);
      const y = clamp(Math.floor(p.y), 0, canvas.height - 1);
      const d = ctx.getImageData(x, y, 1, 1).data;
      setColor(btnOf(e) === 2 ? 'secondary' : 'primary', rgbToHex(d[0], d[1], d[2]));
      setTool(state.prevTool);
    },
  },

  zoom: {
    down(p, e) { zoomStep(btnOf(e) === 2 || e.altKey ? -1 : 1, { x: e.clientX, y: e.clientY }); },
  },

  text: {
    down(p) {
      if (text) { commitText(); return; }
      drag = { a: p, b: p };
    },
    move(p) {
      if (!drag) return;
      drag.b = p;
      positionSelbox(rectFrom(drag.a, p));
    },
    up() {
      if (!drag) return;
      const r = rectFrom(drag.a, drag.b);
      drag = null;
      positionSelbox();
      if (r.w < 10 || r.h < 10) {
        r.w = Math.max(240, state.fontSize * 8);
        r.h = 0;
      }
      openText(r);
    },
  },

  select: {
    down(p, e) {
      if (sel && hitSel(p)) {
        if (e.altKey) {
          // Opción/Alt + arrastrar: mover una copia.
          if (sel.lifted) { pushUndo(); ctx.drawImage(selSource(), sel.x, sel.y); } else liftSelection(false);
        } else {
          liftSelection(true);
        }
        drag = { mode: 'move', dx: p.x - sel.x, dy: p.y - sel.y };
        return;
      }
      commitSelection();
      drag = state.selectMode === 'free' ? { mode: 'free', pts: [clampPt(p)] } : { mode: 'rect', a: p, b: p };
    },
    move(p, e) {
      if (!drag) return;
      if (drag.mode === 'move') {
        sel.x = Math.round(p.x - drag.dx);
        sel.y = Math.round(p.y - drag.dy);
        renderOverlay();
        return;
      }
      if (drag.mode === 'rect') {
        drag.b = e.shiftKey ? constrainSquare(drag.a, p) : p;
        const r = clampRect(rectFrom(drag.a, drag.b));
        positionSelbox(r);
        $('#stSel').textContent = `${r.w} × ${r.h}px`;
        return;
      }
      drag.pts.push(clampPt(p));
      renderOverlay();
      octx.save();
      octx.lineWidth = 1 / state.zoom;
      octx.beginPath();
      drag.pts.forEach((q, i) => (i ? octx.lineTo(q.x, q.y) : octx.moveTo(q.x, q.y)));
      octx.strokeStyle = '#ffffff';
      octx.stroke();
      octx.setLineDash([4 / state.zoom, 4 / state.zoom]);
      octx.strokeStyle = '#000000';
      octx.stroke();
      octx.restore();
    },
    up() {
      if (!drag) return;
      const d = drag;
      drag = null;
      if (d.mode === 'rect') {
        const r = clampRect(rectFrom(d.a, d.b));
        if (r.w > 0 && r.h > 0) makeSelection(r.x, r.y, r.w, r.h);
        else positionSelbox();
      } else if (d.mode === 'free') {
        renderOverlay();
        if (d.pts.length > 2) {
          const xs = d.pts.map((q) => q.x);
          const ys = d.pts.map((q) => q.y);
          const r = clampRect(rectFrom({ x: Math.min(...xs), y: Math.min(...ys) }, { x: Math.max(...xs), y: Math.max(...ys) }));
          if (r.w > 0 && r.h > 0) makeSelection(r.x, r.y, r.w, r.h, d.pts);
        }
      }
      updateStatus();
    },
    hover(p) {
      stage.style.cursor = hitSel(p) ? 'move' : '';
    },
  },

  shape: {
    down(p, e) {
      if (state.shape === 'polygon') {
        // pts son los vértices fijos; cursor es el extremo elástico que sigue al ratón.
        if (!poly) poly = { pts: [p], cursor: p, btn: btnOf(e) };
        else if (poly.pts.length > 2 && dist(poly.pts[0], p) < 8 / state.zoom) { commitPoly(); return; }
        else { const q = constrainLine(poly.pts[poly.pts.length - 1], p, e.shiftKey); poly.pts.push(q); poly.cursor = q; }
        previewShape();
        return;
      }
      if (state.shape === 'curve') {
        if (!curve) curve = { a: p, b: p, c1: null, c2: null, stage: 0, btn: btnOf(e) };
        else if (curve.stage === 1) { curve.c1 = p; curve.c2 = p; }
        else curve.c2 = p;
        previewShape();
        return;
      }
      drag = { shape: true, a: p, b: p, btn: btnOf(e) };
    },
    hover(p, e) {
      if (state.shape !== 'polygon' || !poly) return;
      poly.cursor = constrainLine(poly.pts[poly.pts.length - 1], p, e.shiftKey);
      previewShape();
    },
    move(p, e) {
      if (state.shape === 'polygon') {
        if (!poly) return;
        poly.cursor = constrainLine(poly.pts[poly.pts.length - 1], p, e.shiftKey);
        previewShape();
        return;
      }
      if (state.shape === 'curve') {
        if (!curve) return;
        if (curve.stage === 0) curve.b = constrainLine(curve.a, p, e.shiftKey);
        else if (curve.stage === 1) { curve.c1 = p; curve.c2 = p; }
        else curve.c2 = p;
        previewShape();
        return;
      }
      if (!drag) return;
      if (state.shape === 'line') drag.b = constrainLine(drag.a, p, e.shiftKey);
      else drag.b = e.shiftKey ? constrainSquare(drag.a, p) : p;
      previewShape();
    },
    up() {
      if (state.shape === 'polygon') {
        // El primer tramo se dibuja arrastrando, como en el programa original.
        if (poly && poly.pts.length === 1 && dist(poly.pts[0], poly.cursor) >= 2) poly.pts.push(poly.cursor);
        return;
      }
      if (state.shape === 'curve') {
        if (!curve) return;
        if (curve.stage === 0) {
          if (dist(curve.a, curve.b) < 1) { curve = null; renderOverlay(); return; }
          curve.stage = 1;
        } else if (curve.stage === 1) {
          curve.stage = 2;
        } else {
          commitCurve();
        }
        return;
      }
      if (!drag) return;
      const d = drag;
      drag = null;
      if (dist(d.a, d.b) >= 1) { pushUndo(); drawShape(ctx, state.shape, d.a, d.b, d.btn); }
      renderOverlay();
    },
    dblclick() {
      if (state.shape === 'polygon') commitPoly();
    },
  },
};

function setTool(t) {
  if (t !== state.tool) {
    if (state.tool === 'text') commitText();
    if (state.tool === 'select') commitSelection();
    finishShape();
    if (t === 'picker') state.prevTool = state.tool;
  }
  state.tool = t;
  stage.dataset.tool = t;
  stage.style.cursor = '';
  cursorBox.hidden = true;
  $$('[data-tool]').forEach((b) => b.classList.toggle('active', b.dataset.tool === t));
  $$('#shapeGrid button').forEach((b) => b.classList.toggle('active', t === 'shape' && b.dataset.shape === state.shape));
  $$('[data-brush]').forEach((b) => b.classList.toggle('active', b.dataset.brush === state.brush));
  $$('[data-select-mode]').forEach((b) => b.classList.toggle('active', b.dataset.selectMode === state.selectMode));
  $('#textbar').hidden = t !== 'text';
  updateSizeUI();
}

/* ---------- eventos del lienzo ---------- */

function updateCursorBox(p) {
  if (state.tool !== 'eraser') { cursorBox.hidden = true; return; }
  const s = state.sizes.eraser;
  const z = state.zoom;
  const x = Math.floor(p.x) - Math.floor(s / 2);
  const y = Math.floor(p.y) - Math.floor(s / 2);
  cursorBox.style.left = x * z + 'px';
  cursorBox.style.top = y * z + 'px';
  cursorBox.style.width = s * z + 'px';
  cursorBox.style.height = s * z + 'px';
  cursorBox.hidden = false;
}

stage.addEventListener('pointerdown', (e) => {
  if (e.target === textInput || e.target.classList.contains('handle')) return;
  if (e.button !== 0 && e.button !== 2) return;
  closePopovers();
  if (document.activeElement && document.activeElement !== textInput) document.activeElement.blur();
  stage.setPointerCapture(e.pointerId);
  const tool = TOOLS[state.tool];
  if (tool.down) tool.down(toDoc(e.clientX, e.clientY), e);
});

stage.addEventListener('pointermove', (e) => {
  const p = toDoc(e.clientX, e.clientY);
  if (p.x >= 0 && p.y >= 0 && p.x < canvas.width && p.y < canvas.height) {
    $('#stPos').textContent = `${Math.floor(p.x)}, ${Math.floor(p.y)}px`;
  }
  updateCursorBox(p);
  const tool = TOOLS[state.tool];
  if (stage.hasPointerCapture(e.pointerId)) { if (tool.move) tool.move(p, e); }
  else if (tool.hover) tool.hover(p, e);
});

function endPointer(e) {
  if (!stage.hasPointerCapture(e.pointerId)) return;
  stage.releasePointerCapture(e.pointerId);
  const tool = TOOLS[state.tool];
  if (tool.up) tool.up(toDoc(e.clientX, e.clientY), e);
}
stage.addEventListener('pointerup', endPointer);
stage.addEventListener('pointercancel', endPointer);
stage.addEventListener('pointerleave', () => { $('#stPos').textContent = ''; cursorBox.hidden = true; });
stage.addEventListener('contextmenu', (e) => e.preventDefault());
stage.addEventListener('dblclick', (e) => {
  const tool = TOOLS[state.tool];
  if (tool.dblclick) tool.dblclick(toDoc(e.clientX, e.clientY), e);
});

textInput.addEventListener('pointerdown', (e) => e.stopPropagation());
textInput.addEventListener('input', growText);

// Clic en la zona gris: termina la selección o el texto.
workspace.addEventListener('pointerdown', (e) => {
  if (e.target !== workspace && e.target.id !== 'stageWrap') return;
  closePopovers();
  commitText();
  finishShape();
  commitSelection();
});

workspace.addEventListener('wheel', (e) => {
  if (!e.ctrlKey && !e.metaKey) return;
  e.preventDefault();
  setZoom(state.zoom * Math.exp(-clamp(e.deltaY, -30, 30) * 0.01), { x: e.clientX, y: e.clientY });
}, { passive: false });

// Tiradores para cambiar el tamaño del lienzo.
$$('.handle').forEach((h) => {
  h.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    commitAll();
    h.setPointerCapture(e.pointerId);
    const dir = h.dataset.dir;
    const ghost = $('#resizeGhost');
    let size = null;
    const onMove = (ev) => {
      const p = toDoc(ev.clientX, ev.clientY);
      const w = dir.includes('e') ? clamp(Math.round(p.x), 1, 12000) : canvas.width;
      const hh = dir.includes('s') ? clamp(Math.round(p.y), 1, 12000) : canvas.height;
      size = [w, hh];
      ghost.style.width = w * state.zoom + 'px';
      ghost.style.height = hh * state.zoom + 'px';
      ghost.hidden = false;
      $('#stSize').textContent = `${w} × ${hh}px`;
    };
    const onUp = () => {
      h.removeEventListener('pointermove', onMove);
      h.removeEventListener('pointerup', onUp);
      h.removeEventListener('pointercancel', onUp);
      ghost.hidden = true;
      if (size && (size[0] !== canvas.width || size[1] !== canvas.height)) {
        pushUndo();
        setCanvasSize(size[0], size[1], true);
      }
      updateStatus();
    };
    h.addEventListener('pointermove', onMove);
    h.addEventListener('pointerup', onUp);
    h.addEventListener('pointercancel', onUp);
  });
});

/* ---------- colores y tamaño ---------- */

function setColor(which, hex) {
  state[which] = hex.toLowerCase();
  $('#color1 span').style.background = state.primary;
  $('#color2 span').style.background = state.secondary;
  styleText();
  if (sel && sel.lifted && state.transparentSel) renderOverlay();
  updateSizeUI();
}

function swapColors() {
  const p = state.primary;
  setColor('primary', state.secondary);
  setColor('secondary', p);
}

function addCustomColor(hex) {
  state.custom = [hex, ...state.custom.filter((c) => c !== hex)].slice(0, 10);
  renderCustomPalette();
}

function renderCustomPalette() {
  const box = $('#customPalette');
  box.innerHTML = '';
  for (let i = 0; i < 10; i++) {
    const c = state.custom[i];
    const b = document.createElement('button');
    if (c) { b.style.background = c; b.title = c; b.dataset.color = c; } else b.className = 'empty';
    box.appendChild(b);
  }
}

let colorTarget = 'primary';
function pickCustomColor(which) {
  colorTarget = which;
  const input = $('#colorInput');
  input.value = state[which];
  input.click();
}

function sizeKey() {
  return { pencil: 'pencil', brush: 'brush', eraser: 'eraser', shape: 'shape' }[state.tool] || null;
}

function updateSizeUI() {
  const key = sizeKey();
  $('#sizeBtn').disabled = !key;
  const v = key ? state.sizes[key] : 1;
  $('#sizeLabel').textContent = `${v} px`;
  const prev = $('#sizePreview');
  prev.style.height = clamp(v, 1, 16) + 'px';
  $('#sizeRange').value = v;
  $('#sizeRangeLabel').textContent = `${v} px`;
}

function setSize(v) {
  const key = sizeKey();
  if (!key) return;
  state.sizes[key] = clamp(Math.round(v), 1, 60);
  updateSizeUI();
  if (drag === null && (curve || poly)) previewShape();
}

/* ---------- archivos ---------- */

function markDirty() {
  if (!state.dirty) { state.dirty = true; updateTitle(); }
}

function updateTitle() {
  const name = state.fileName || 'Sin título';
  document.title = `${name}${state.dirty ? ' •' : ''} — Lienzo`;
  if (api) api.setState({ title: document.title, dirty: state.dirty, path: state.filePath });
}

function resetDoc(w, h, img) {
  sel = null;
  drag = null;
  curve = null;
  poly = null;
  cancelText();
  undoStack.length = 0;
  redoStack.length = 0;
  setCanvasSize(w, h, false);
  if (img) ctx.drawImage(img, 0, 0);
  state.fileName = null;
  state.filePath = null;
  state.dirty = false;
  updateUndoUI();
  updateTitle();
  fitIfNeeded();
}

async function confirmDiscard() {
  if (!state.dirty) return true;
  if (api) {
    const answer = await api.confirmDiscard();
    if (answer === 'cancel') return false;
    if (answer === 'save') return save();
    return true;
  }
  return window.confirm('Hay cambios sin guardar. ¿Quieres descartarlos?');
}

async function newImage() {
  commitAll();
  if (!(await confirmDiscard())) return;
  resetDoc(DEFAULT_W, DEFAULT_H);
}

async function openImage() {
  commitAll();
  if (!(await confirmDiscard())) return;
  if (api) {
    const data = await api.openDialog();
    if (data) loadFileData(data);
  } else {
    $('#fileInput').click();
  }
}

async function loadFileData(data) {
  if (data.error) { alertModal('No se pudo abrir la imagen', data.error); return; }
  try {
    const img = await loadImg(data.dataUrl);
    resetDoc(img.naturalWidth, img.naturalHeight, img);
    state.fileName = data.name;
    state.filePath = data.path || null;
    updateTitle();
  } catch {
    alertModal('No se pudo abrir la imagen', `«${data.name}» no es una imagen válida o está dañada.`);
  }
}

function encodeBMP(c) {
  const w = c.width;
  const h = c.height;
  const src = c.getContext('2d').getImageData(0, 0, w, h).data;
  const row = Math.ceil(w * 3 / 4) * 4;
  const size = 54 + row * h;
  const out = new Uint8Array(size);
  const dv = new DataView(out.buffer);
  out[0] = 0x42;
  out[1] = 0x4d;
  dv.setUint32(2, size, true);
  dv.setUint32(10, 54, true);
  dv.setUint32(14, 40, true);
  dv.setInt32(18, w, true);
  dv.setInt32(22, h, true);
  dv.setUint16(26, 1, true);
  dv.setUint16(28, 24, true);
  dv.setUint32(34, row * h, true);
  dv.setInt32(38, 2835, true);
  dv.setInt32(42, 2835, true);
  for (let y = 0; y < h; y++) {
    let o = 54 + (h - 1 - y) * row;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      out[o++] = src[i + 2];
      out[o++] = src[i + 1];
      out[o++] = src[i];
    }
  }
  return out;
}

async function encode(c, ext) {
  if (ext === 'bmp') return encodeBMP(c);
  const mime = MIME[ext] || 'image/png';
  const blob = await new Promise((resolve) => c.toBlob(resolve, mime, 0.92));
  return new Uint8Array(await blob.arrayBuffer());
}

async function writeTo(file) {
  const bytes = await encode(canvas, extOf(file));
  await api.writeFile(file, bytes);
  state.filePath = file;
  state.fileName = baseName(file);
  state.dirty = false;
  updateTitle();
  return true;
}

async function download(name) {
  const ext = extOf(name) || 'png';
  const bytes = await encode(canvas, ext);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes], { type: MIME[ext] || 'image/png' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  state.dirty = false;
  updateTitle();
  return true;
}

function suggestedName() {
  return (state.fileName || 'Sin título').replace(/\.[^.]+$/, '') + '.png';
}

async function save() {
  commitAll();
  if (!api) return download(suggestedName());
  if (!state.filePath || !WRITABLE.includes(extOf(state.filePath))) return saveAs();
  try {
    return await writeTo(state.filePath);
  } catch {
    alertModal('No se pudo guardar', 'Comprueba que tienes permiso para escribir en esa carpeta.');
    return false;
  }
}

async function saveAs() {
  commitAll();
  if (!api) return download(suggestedName());
  const file = await api.saveDialog(suggestedName());
  if (!file) return false;
  try {
    return await writeTo(file);
  } catch {
    alertModal('No se pudo guardar', 'Comprueba que tienes permiso para escribir en esa carpeta.');
    return false;
  }
}

/* ---------- portapapeles ---------- */

async function copy() {
  commitText();
  const src = sel ? sel.canvas : canvas;
  const dataUrl = src.toDataURL('image/png');
  if (api) { await api.writeClipboardImage(dataUrl); return; }
  try {
    const blob = await new Promise((resolve) => src.toBlob(resolve, 'image/png'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  } catch { /* el navegador no permite escribir imágenes */ }
}

async function cut() {
  if (!sel) return;
  await copy();
  deleteSelection();
}

async function paste() {
  if (!api) return; // en el navegador se usa el evento «paste»
  const url = await api.readClipboardImage();
  if (url) pasteImage(await loadImg(url));
}

function pasteImage(img) {
  commitAll();
  setTool('select');
  pushUndo();
  if (img.width > canvas.width || img.height > canvas.height) {
    setCanvasSize(Math.max(img.width, canvas.width), Math.max(img.height, canvas.height), true);
  }
  const c = makeCanvas(img.width, img.height);
  c.getContext('2d').drawImage(img, 0, 0);
  const ws = workspace.getBoundingClientRect();
  const origin = toDoc(ws.left, ws.top);
  const x = clamp(Math.round(origin.x), 0, Math.max(0, canvas.width - c.width));
  const y = clamp(Math.round(origin.y), 0, Math.max(0, canvas.height - c.height));
  sel = { x, y, w: c.width, h: c.height, canvas: c, path: null, lifted: true, version: 0 };
  renderOverlay();
  updateStatus();
}

document.addEventListener('paste', async (e) => {
  if (api || e.target === textInput) return;
  const item = [...e.clipboardData.items].find((i) => i.type.startsWith('image/'));
  if (!item) return;
  e.preventDefault();
  pasteImage(await loadImg(await blobToDataURL(item.getAsFile())));
});

/* ---------- diálogos ---------- */

function openModal(title, html, onOk, { okLabel = 'Aceptar', cancel = true } = {}) {
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = html;
  $('#modalOk').textContent = okLabel;
  $('#modalCancel').hidden = !cancel;
  modalOk = onOk;
  $('#modal').hidden = false;
  setTimeout(() => ($('#modalBody input') || $('#modalOk')).focus(), 0);
}
function closeModal() {
  $('#modal').hidden = true;
  modalOk = null;
}
const isModalOpen = () => !$('#modal').hidden;

function alertModal(title, message) {
  openModal(title, `<p>${escapeHtml(message)}</p>`, null, { cancel: false });
}

$('#modalOk').addEventListener('click', () => {
  if (modalOk && modalOk() === false) return;
  closeModal();
});
$('#modalCancel').addEventListener('click', closeModal);

function showResize() {
  commitText();
  finishShape();
  const baseW = sel ? sel.w : canvas.width;
  const baseH = sel ? sel.h : canvas.height;
  openModal(sel ? 'Cambiar tamaño y sesgar la selección' : 'Cambiar tamaño y sesgar', `
    <fieldset>
      <legend>Cambiar tamaño</legend>
      <div class="row">
        <label><input type="radio" name="rzUnit" value="pct" checked> Porcentaje</label>
        <label><input type="radio" name="rzUnit" value="px"> Píxeles</label>
      </div>
      <div class="row"><span>Horizontal</span><input type="number" id="rzW" min="1" value="100"></div>
      <div class="row"><span>Vertical</span><input type="number" id="rzH" min="1" value="100"></div>
      <label><input type="checkbox" id="rzKeep" checked> Mantener relación de aspecto</label>
    </fieldset>
    <fieldset>
      <legend>Sesgar (grados)</legend>
      <div class="row"><span>Horizontal</span><input type="number" id="skX" min="-89" max="89" value="0"></div>
      <div class="row"><span>Vertical</span><input type="number" id="skY" min="-89" max="89" value="0"></div>
    </fieldset>`, () => {
    const pct = $('input[name="rzUnit"]:checked').value === 'pct';
    const w = Number($('#rzW').value);
    const h = Number($('#rzH').value);
    const sx = clamp(Number($('#skX').value) || 0, -89, 89);
    const sy = clamp(Number($('#skY').value) || 0, -89, 89);
    if (!(w > 0) || !(h > 0)) return false;
    const nw = Math.max(1, Math.round(pct ? baseW * w / 100 : w));
    const nh = Math.max(1, Math.round(pct ? baseH * h / 100 : h));
    if (nw > 12000 || nh > 12000) return false;
    if (nw === baseW && nh === baseH && !sx && !sy) return true;
    transformImage((c) => resizedSkewed(c, nw, nh, sx, sy));
    return true;
  });
  const unit = () => $('input[name="rzUnit"]:checked').value;
  $$('input[name="rzUnit"]').forEach((r) => r.addEventListener('change', () => {
    const px = unit() === 'px';
    $('#rzW').value = px ? baseW : 100;
    $('#rzH').value = px ? baseH : 100;
  }));
  $('#rzW').addEventListener('input', () => {
    if (!$('#rzKeep').checked) return;
    const v = Number($('#rzW').value) || 0;
    $('#rzH').value = unit() === 'px' ? Math.round(v * baseH / baseW) : v;
  });
  $('#rzH').addEventListener('input', () => {
    if (!$('#rzKeep').checked) return;
    const v = Number($('#rzH').value) || 0;
    $('#rzW').value = unit() === 'px' ? Math.round(v * baseW / baseH) : v;
  });
}

function showProperties() {
  commitAll();
  openModal('Propiedades de la imagen', `
    <fieldset>
      <legend>Tamaño del lienzo (píxeles)</legend>
      <div class="row"><span>Ancho</span><input type="number" id="ppW" min="1" max="12000" value="${canvas.width}"></div>
      <div class="row"><span>Alto</span><input type="number" id="ppH" min="1" max="12000" value="${canvas.height}"></div>
    </fieldset>
    <p style="color:var(--muted);margin:0 0 12px">${state.filePath ? escapeHtml(state.filePath) : 'Imagen sin guardar'}</p>`, () => {
    const w = Math.round(Number($('#ppW').value));
    const h = Math.round(Number($('#ppH').value));
    if (!(w >= 1 && w <= 12000 && h >= 1 && h <= 12000)) return false;
    if (w !== canvas.width || h !== canvas.height) { pushUndo(); setCanvasSize(w, h, true); }
    return true;
  });
}

function showShortcuts() {
  const m = isMac ? '⌘' : 'Ctrl+';
  const s = isMac ? '⇧' : 'Mayús+';
  const rows = [
    ['Nuevo / Abrir / Guardar', `${m}N · ${m}O · ${m}S`],
    ['Guardar como', `${s}${m}S`],
    ['Deshacer / Rehacer', `${m}Z · ${isMac ? '⇧⌘Z' : 'Ctrl+Y'}`],
    ['Cortar / Copiar / Pegar', `${m}X · ${m}C · ${m}V`],
    ['Seleccionar todo', `${m}A`],
    ['Recortar a la selección', `${s}${m}X`],
    ['Cambiar tamaño y sesgar', `${m}R`],
    ['Propiedades de la imagen', `${m}E`],
    ['Invertir colores', `${s}${m}I`],
    ['Acercar / Alejar / 100%', `${m}+ · ${m}− · ${m}0`],
    ['Zoom con trackpad', 'Pellizcar'],
    ['Eliminar selección', 'Supr / ⌫'],
    ['Mover selección 1 px', 'Flechas'],
    ['Mover una copia de la selección', `${isMac ? '⌥' : 'Alt'} + arrastrar`],
    ['Cuadrado, círculo, ángulos de 45°', 'Mantener ⇧ al dibujar'],
    ['Usar el color 2', isMac ? 'Clic derecho o ctrl+clic' : 'Clic derecho'],
    ['Lápiz · Pincel · Borrador', 'P · B · E'],
    ['Relleno · Texto · Selector de color', 'F · T · I'],
    ['Lupa · Selección', 'Z · S'],
    ['Línea · Rectángulo · Óvalo', 'L · R · O'],
    ['Intercambiar colores', 'X'],
    ['Terminar polígono o curva', 'Intro o doble clic'],
  ];
  openModal('Atajos de teclado', `<table>${rows.map(([a, b]) => `<tr><td>${a}</td><td><kbd>${b}</kbd></td></tr>`).join('')}</table>`,
    null, { cancel: false });
}

function showAbout() {
  openModal('Acerca de Lienzo', `<p>Lienzo es un editor de dibujo sencillo, libre y de código abierto (licencia MIT).</p>
    <p style="color:var(--muted)">Inspirado en el clásico programa de pintura de Windows. No está afiliado a Microsoft.</p>`,
  null, { cancel: false });
}

/* ---------- comandos y teclado ---------- */

const COMMANDS = {
  new: newImage,
  open: openImage,
  save: () => save(),
  saveAs: () => saveAs(),
  properties: showProperties,
  undo,
  redo,
  cut,
  copy,
  paste,
  delete: () => deleteSelection(),
  selectAll,
  crop,
  resize: showResize,
  rotateRight: () => transformImage((c) => rotated(c, 90)),
  rotateLeft: () => transformImage((c) => rotated(c, -90)),
  rotate180: () => transformImage((c) => rotated(c, 180)),
  flipH: () => transformImage((c) => flipped(c, true)),
  flipV: () => transformImage((c) => flipped(c, false)),
  invert: () => transformImage(inverted),
  clear: clearImage,
  zoomIn: () => zoomStep(1),
  zoomOut: () => zoomStep(-1),
  zoomReset: () => setZoom(1),
  zoomFit,
  shortcuts: showShortcuts,
  about: showAbout,
  'save-and-close': async () => { if (await save()) api.closeNow(); },
};

const EDIT_COMMANDS = ['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll'];

function runCommand(cmd) {
  const el = document.activeElement;
  const typing = el && (el === textInput || /^(INPUT|TEXTAREA)$/.test(el.tagName)) && el.type !== 'range' && el.type !== 'checkbox' && el.type !== 'radio';
  if (typing && EDIT_COMMANDS.includes(cmd)) {
    if (api) api.nativeEdit(cmd);
    else document.execCommand(cmd);
    return;
  }
  if (isModalOpen() && cmd !== 'save-and-close') return;
  closePopovers();
  const fn = COMMANDS[cmd];
  if (fn) fn();
}

const TOOL_KEYS = { p: 'pencil', b: 'brush', e: 'eraser', f: 'fill', t: 'text', i: 'picker', z: 'zoom', s: 'select' };
const SHAPE_KEYS = { l: 'line', r: 'rect', o: 'oval' };
const BROWSER_SHORTCUTS = {
  n: 'new', o: 'open', s: 'save', S: 'saveAs', z: 'undo', Z: 'redo', y: 'redo', a: 'selectAll',
  c: 'copy', x: 'cut', X: 'crop', e: 'properties', r: 'resize', I: 'invert', '=': 'zoomIn', '+': 'zoomIn',
  '-': 'zoomOut', '0': 'zoomReset', '9': 'zoomFit',
};

document.addEventListener('keydown', (e) => {
  const el = e.target;
  const typing = el === textInput || (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && !['range', 'checkbox', 'radio'].includes(el.type));

  if (isModalOpen()) {
    if (e.key === 'Escape') { e.preventDefault(); closeModal(); }
    else if (e.key === 'Enter' && el.tagName !== 'BUTTON') { e.preventDefault(); $('#modalOk').click(); }
    return;
  }

  if (e.key === 'Escape') {
    closePopovers();
    if (text) commitText();
    else if (poly || curve) { poly = null; curve = null; renderOverlay(); }
    else if (sel) commitSelection();
    return;
  }
  if (typing) return;

  const mod = isMac ? e.metaKey : e.ctrlKey;
  if (mod) {
    // En la app de escritorio el menú nativo gestiona estos atajos.
    if (api) return;
    let key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (e.shiftKey && BROWSER_SHORTCUTS[key.toUpperCase()]) key = key.toUpperCase();
    const cmd = BROWSER_SHORTCUTS[key];
    if (cmd) { e.preventDefault(); runCommand(cmd); }
    return;
  }
  if (e.altKey || e.ctrlKey || e.metaKey) return;

  const step = e.shiftKey ? 10 : 1;
  switch (e.key) {
    case 'Delete':
    case 'Backspace':
      if (sel) { e.preventDefault(); deleteSelection(); }
      return;
    case 'Enter':
      if (poly) commitPoly();
      else if (curve) commitCurve();
      return;
    case 'ArrowLeft':
    case 'ArrowRight':
    case 'ArrowUp':
    case 'ArrowDown': {
      if (!sel) return;
      e.preventDefault();
      liftSelection(true);
      if (e.key === 'ArrowLeft') sel.x -= step;
      if (e.key === 'ArrowRight') sel.x += step;
      if (e.key === 'ArrowUp') sel.y -= step;
      if (e.key === 'ArrowDown') sel.y += step;
      renderOverlay();
      return;
    }
    default: {
      const k = e.key.toLowerCase();
      if (TOOL_KEYS[k]) setTool(TOOL_KEYS[k]);
      else if (SHAPE_KEYS[k]) { finishShape(); state.shape = SHAPE_KEYS[k]; setTool('shape'); }
      else if (k === 'x') swapColors();
    }
  }
});

/* ---------- interfaz ---------- */

function closePopovers() {
  $$('.popover').forEach((p) => { p.hidden = true; });
}

function openPopover(pop, btn) {
  pop.hidden = false;
  const r = btn.getBoundingClientRect();
  pop.style.left = Math.max(8, Math.min(r.left, innerWidth - pop.offsetWidth - 8)) + 'px';
  pop.style.top = r.bottom + 4 + 'px';
}

document.addEventListener('click', (e) => {
  const popBtn = e.target.closest('[data-pop]');
  if (popBtn) {
    const pop = document.getElementById(popBtn.dataset.pop);
    const wasHidden = pop.hidden;
    closePopovers();
    if (wasHidden) openPopover(pop, popBtn);
    return;
  }
  const cmdBtn = e.target.closest('[data-cmd]');
  if (cmdBtn) { runCommand(cmdBtn.dataset.cmd); return; }
  const toolBtn = e.target.closest('[data-tool]');
  if (toolBtn) { closePopovers(); setTool(toolBtn.dataset.tool); return; }
  const shapeBtn = e.target.closest('[data-shape]');
  if (shapeBtn) {
    closePopovers();
    finishShape();
    state.shape = shapeBtn.dataset.shape;
    setTool('shape');
    return;
  }
  const brushBtn = e.target.closest('[data-brush]');
  if (brushBtn) { closePopovers(); state.brush = brushBtn.dataset.brush; setTool('brush'); return; }
  const modeBtn = e.target.closest('[data-select-mode]');
  if (modeBtn) { closePopovers(); state.selectMode = modeBtn.dataset.selectMode; setTool('select'); return; }
  const sizeBtn = e.target.closest('[data-size]');
  if (sizeBtn) { setSize(Number(sizeBtn.dataset.size)); closePopovers(); return; }
  if (!e.target.closest('.popover')) closePopovers();
});

function buildUI() {
  $$('[data-icon]').forEach((el) => { el.insertAdjacentHTML('afterbegin', svg(el.dataset.icon)); });

  // Botones de formas, dibujados con las mismas rutas que usa el lienzo.
  const grid = $('#shapeGrid');
  for (const [id, title] of SHAPES) {
    const b = document.createElement('button');
    b.dataset.shape = id;
    b.title = title;
    const c = document.createElement('canvas');
    c.width = 36;
    c.height = 36;
    b.appendChild(c);
    grid.appendChild(b);
  }
  drawShapeIcons();

  const pal = $('#palette');
  for (const c of PALETTE) {
    const b = document.createElement('button');
    b.style.background = c;
    b.title = c;
    b.dataset.color = c;
    pal.appendChild(b);
  }
  renderCustomPalette();

  const onSwatch = (e, which) => {
    const b = e.target.closest('[data-color]');
    if (!b) return;
    e.preventDefault();
    setColor(which, b.dataset.color);
  };
  for (const box of [$('#palette'), $('#customPalette')]) {
    box.addEventListener('click', (e) => onSwatch(e, 'primary'));
    box.addEventListener('contextmenu', (e) => onSwatch(e, 'secondary'));
  }
  $('#color1').addEventListener('click', () => pickCustomColor('primary'));
  $('#color2').addEventListener('click', () => pickCustomColor('secondary'));
  $('#editColors').addEventListener('click', () => pickCustomColor('primary'));
  $('#swapBtn').addEventListener('click', swapColors);
  $('#colorInput').addEventListener('input', (e) => setColor(colorTarget, e.target.value));
  $('#colorInput').addEventListener('change', (e) => addCustomColor(e.target.value.toLowerCase()));

  const presets = $('#sizePresets');
  for (const v of SIZE_PRESETS) {
    const b = document.createElement('button');
    b.dataset.size = v;
    b.innerHTML = `<i style="height:${Math.min(v, 16)}px"></i><small>${v} px</small>`;
    presets.appendChild(b);
  }
  $('#sizeRange').addEventListener('input', (e) => setSize(Number(e.target.value)));

  $('#outlineSel').addEventListener('change', (e) => { state.outline = e.target.value; previewShape(); });
  $('#fillSel').addEventListener('change', (e) => { state.fill = e.target.value; previewShape(); });
  $('#transparentSel').addEventListener('change', (e) => { state.transparentSel = e.target.checked; if (sel) renderOverlay(); });

  const fontSel = $('#fontSel');
  for (const f of FONTS) fontSel.add(new Option(f, f));
  fontSel.value = state.font;
  const sizeSel = $('#fontSizeSel');
  for (const s of FONT_SIZES) sizeSel.add(new Option(String(s), String(s)));
  sizeSel.value = String(state.fontSize);
  const refocus = () => { if (text) textInput.focus(); };
  fontSel.addEventListener('change', () => { state.font = fontSel.value; styleText(); growText(); refocus(); });
  sizeSel.addEventListener('change', () => { state.fontSize = Number(sizeSel.value); styleText(); growText(); refocus(); });
  const toggles = { boldBtn: 'bold', italicBtn: 'italic', underlineBtn: 'underline' };
  for (const [id, key] of Object.entries(toggles)) {
    const b = document.getElementById(id);
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => { state[key] = !state[key]; b.classList.toggle('on', state[key]); styleText(); growText(); });
  }
  $$('input[name="textBg"]').forEach((r) => r.addEventListener('change', () => {
    state.textOpaque = $('input[name="textBg"]:checked').value === 'opaque';
    styleText();
    refocus();
  }));

  $('#zoomRange').addEventListener('input', (e) => setZoom(rangeToZoom(Number(e.target.value))));

  $('#fileInput').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) loadFileData({ name: f.name, dataUrl: await blobToDataURL(f) });
  });

  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', async (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (!f) return;
    commitAll();
    if (!(await confirmDiscard())) return;
    const file = api ? api.getPathForFile(f) : '';
    if (file) loadFileData(await api.openPath(file));
    else loadFileData({ name: f.name, dataUrl: await blobToDataURL(f) });
  });

  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', drawShapeIcons);
  window.addEventListener('resize', closePopovers);

  if (api) {
    api.onMenu(runCommand);
    api.onOpenData(async (data) => {
      commitAll();
      if (await confirmDiscard()) loadFileData(data);
    });
  } else {
    window.addEventListener('beforeunload', (e) => { if (state.dirty) e.preventDefault(); });
  }
}

function drawShapeIcons() {
  const color = getComputedStyle(document.body).color;
  for (const b of $$('#shapeGrid button')) {
    const c = b.querySelector('canvas');
    const g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, c.width, c.height);
    g.setTransform(2, 0, 0, 2, 0, 0);
    g.strokeStyle = color;
    g.lineWidth = 1.2;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    const id = b.dataset.shape;
    g.beginPath();
    if (id === 'line') { g.moveTo(3, 15); g.lineTo(15, 3); g.stroke(); continue; }
    if (id === 'curve') { g.moveTo(2.5, 14); g.bezierCurveTo(5, 0, 12, 20, 15.5, 4); g.stroke(); continue; }
    if (id === 'polygon') {
      g.moveTo(3, 14); g.lineTo(6, 3); g.lineTo(15, 6); g.lineTo(12, 11); g.lineTo(15, 15); g.closePath(); g.stroke();
      continue;
    }
    g.stroke(shapePath(id, 2.5, 2.5, 15.5, 15.5));
  }
}

function updateStatus() {
  $('#stSize').textContent = `${canvas.width} × ${canvas.height}px`;
  $('#stSel').textContent = sel ? `${sel.w} × ${sel.h}px` : '';
  $('#zoomLabel').textContent = `${Math.round(state.zoom * 100)}%`;
  $('#zoomRange').value = zoomToRange(state.zoom);
}

/* ---------- inicio ---------- */

buildUI();
setColor('primary', state.primary);
setColor('secondary', state.secondary);
setTool('pencil');
resetDoc(DEFAULT_W, DEFAULT_H);
if (api) api.ready();
