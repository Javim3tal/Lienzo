'use strict';
// Proceso principal de Lienzo: ventana, menú nativo y acceso a archivos/portapapeles.

const { app, BrowserWindow, Menu, dialog, ipcMain, clipboard, nativeImage, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const os = require('os');
const { execFile } = require('child_process');

const isMac = process.platform === 'darwin';

const MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', jpe: 'image/jpeg', jfif: 'image/jpeg',
  gif: 'image/gif', bmp: 'image/bmp', dib: 'image/bmp', webp: 'image/webp', ico: 'image/x-icon',
  avif: 'image/avif', svg: 'image/svg+xml',
};
// Formatos que Chromium no decodifica; en macOS se convierten a PNG con `sips`.
const CONVERT = ['heic', 'heif', 'hif', 'avci', 'tif', 'tiff'];
const OPEN_EXT = [...Object.keys(MIME), ...CONVERT];
const EDIT_COMMANDS = ['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll'];

let win = null;
let rendererReady = false;
let pending = [];
let docState = { dirty: false, path: null };
let forceClose = false;
// Solo se escribe en rutas que el usuario eligió en un diálogo o abrió él mismo.
const allowedPaths = new Set();

function createWindow() {
  forceClose = false;
  rendererReady = false;
  docState = { dirty: false, path: null };
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 760,
    minHeight: 520,
    title: 'Lienzo',
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#202020' : '#f3f3f3',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.on('close', (e) => {
    if (forceClose || !docState.dirty) return;
    e.preventDefault();
    askSave().then((answer) => {
      if (!win) return;
      if (answer === 'save') win.webContents.send('menu', 'save-and-close');
      else if (answer === 'discard') { forceClose = true; win.close(); }
    });
  });
  win.on('closed', () => { win = null; });
}

async function askSave() {
  const { response } = await dialog.showMessageBox(win, {
    type: 'warning',
    buttons: ['Guardar', 'No guardar', 'Cancelar'],
    defaultId: 0,
    cancelId: 2,
    message: '¿Quieres guardar los cambios de esta imagen?',
    detail: 'Si no los guardas, se perderán.',
  });
  return ['save', 'discard', 'cancel'][response];
}

async function readImage(file) {
  const name = path.basename(file);
  const ext = path.extname(file).slice(1).toLowerCase();
  try {
    let buf;
    let mime = MIME[ext];
    if (CONVERT.includes(ext)) {
      if (!isMac) return { name, error: `El formato .${ext} solo se puede abrir en macOS.` };
      const tmp = path.join(os.tmpdir(), `lienzo-${process.pid}-${Date.now()}.png`);
      await new Promise((resolve, reject) => {
        execFile('/usr/bin/sips', ['-s', 'format', 'png', file, '--out', tmp], (err) => (err ? reject(err) : resolve()));
      });
      buf = await fs.readFile(tmp);
      fs.unlink(tmp).catch(() => {});
      mime = 'image/png';
    } else {
      if (!mime) return { name, error: `El formato .${ext || '?'} no es compatible.` };
      buf = await fs.readFile(file);
    }
    allowedPaths.add(file);
    app.addRecentDocument(file);
    return { name, path: file, dataUrl: `data:${mime};base64,${buf.toString('base64')}` };
  } catch {
    return { name, error: `No se pudo abrir «${name}».` };
  }
}

function openPath(file) {
  if (!win) { pending.push(file); createWindow(); return; }
  if (!rendererReady) { pending.push(file); return; }
  readImage(file).then((data) => { if (win) win.webContents.send('open-data', data); });
}

// macOS: abrir desde Finder, «Abrir con» o arrastrando al icono del Dock.
app.on('open-file', (e, file) => {
  e.preventDefault();
  if (app.isReady()) openPath(file);
  else pending.push(file);
});

ipcMain.on('renderer-ready', () => {
  rendererReady = true;
  const file = pending.pop();
  pending = [];
  if (file) openPath(file);
});

ipcMain.handle('open-dialog', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Abrir imagen',
    properties: ['openFile'],
    filters: [
      { name: 'Imágenes', extensions: OPEN_EXT },
      { name: 'Todos los archivos', extensions: ['*'] },
    ],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  return readImage(r.filePaths[0]);
});

ipcMain.handle('open-path', (_e, file) => readImage(String(file)));

ipcMain.handle('save-dialog', async (_e, defaultName) => {
  const dir = docState.path ? path.dirname(docState.path) : app.getPath('pictures');
  const r = await dialog.showSaveDialog(win, {
    title: 'Guardar como',
    defaultPath: path.join(dir, path.basename(String(defaultName || 'Sin título.png'))),
    filters: [
      { name: 'PNG', extensions: ['png'] },
      { name: 'JPEG', extensions: ['jpg', 'jpeg'] },
      { name: 'BMP', extensions: ['bmp'] },
      { name: 'WebP', extensions: ['webp'] },
    ],
  });
  if (r.canceled || !r.filePath) return null;
  allowedPaths.add(r.filePath);
  return r.filePath;
});

ipcMain.handle('write-file', async (_e, file, bytes) => {
  if (!allowedPaths.has(file)) throw new Error('Ruta no autorizada');
  await fs.writeFile(file, Buffer.from(bytes));
  app.addRecentDocument(file);
  return true;
});

ipcMain.on('set-state', (_e, s) => {
  docState = { dirty: !!s.dirty, path: s.path || null };
  if (!win) return;
  win.setTitle(String(s.title || 'Lienzo'));
  if (isMac) {
    win.setDocumentEdited(docState.dirty);
    win.setRepresentedFilename(docState.path || '');
  }
});

ipcMain.handle('confirm-discard', () => askSave());

ipcMain.on('close-now', () => {
  if (!win) return;
  forceClose = true;
  win.close();
});

ipcMain.handle('clipboard-read', () => {
  const img = clipboard.readImage();
  return img.isEmpty() ? null : img.toDataURL();
});

ipcMain.handle('clipboard-write', (_e, dataUrl) => {
  clipboard.writeImage(nativeImage.createFromDataURL(String(dataUrl)));
  return true;
});

ipcMain.on('native-edit', (e, cmd) => {
  if (EDIT_COMMANDS.includes(cmd)) e.sender[cmd]();
});

function send(cmd) {
  return () => {
    if (!win) { createWindow(); return; }
    win.webContents.send('menu', cmd);
  };
}

function buildMenu() {
  const item = (label, cmd, accelerator) => ({ label, accelerator, click: send(cmd) });
  const sep = { type: 'separator' };
  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about', label: 'Acerca de Lienzo' },
        sep,
        { role: 'services', label: 'Servicios' },
        sep,
        { role: 'hide', label: 'Ocultar Lienzo' },
        { role: 'hideOthers', label: 'Ocultar otros' },
        { role: 'unhide', label: 'Mostrar todo' },
        sep,
        { role: 'quit', label: 'Salir de Lienzo' },
      ],
    }] : []),
    {
      label: 'Archivo',
      submenu: [
        item('Nuevo', 'new', 'CmdOrCtrl+N'),
        item('Abrir…', 'open', 'CmdOrCtrl+O'),
        ...(isMac ? [{ role: 'recentDocuments', label: 'Abrir recientes', submenu: [{ role: 'clearRecentDocuments', label: 'Borrar menú' }] }] : []),
        sep,
        item('Guardar', 'save', 'CmdOrCtrl+S'),
        item('Guardar como…', 'saveAs', 'CmdOrCtrl+Shift+S'),
        sep,
        item('Propiedades de la imagen…', 'properties', 'CmdOrCtrl+E'),
        sep,
        isMac ? { role: 'close', label: 'Cerrar ventana' } : { role: 'quit', label: 'Salir' },
      ],
    },
    {
      label: 'Editar',
      submenu: [
        item('Deshacer', 'undo', 'CmdOrCtrl+Z'),
        item('Rehacer', 'redo', isMac ? 'Cmd+Shift+Z' : 'Ctrl+Y'),
        sep,
        item('Cortar', 'cut', 'CmdOrCtrl+X'),
        item('Copiar', 'copy', 'CmdOrCtrl+C'),
        item('Pegar', 'paste', 'CmdOrCtrl+V'),
        item('Eliminar selección', 'delete'),
        sep,
        item('Seleccionar todo', 'selectAll', 'CmdOrCtrl+A'),
      ],
    },
    {
      label: 'Imagen',
      submenu: [
        item('Recortar a la selección', 'crop', 'CmdOrCtrl+Shift+X'),
        item('Cambiar tamaño y sesgar…', 'resize', 'CmdOrCtrl+R'),
        sep,
        item('Girar 90° a la derecha', 'rotateRight'),
        item('Girar 90° a la izquierda', 'rotateLeft'),
        item('Girar 180°', 'rotate180'),
        item('Voltear horizontalmente', 'flipH'),
        item('Voltear verticalmente', 'flipV'),
        sep,
        item('Invertir colores', 'invert', 'CmdOrCtrl+Shift+I'),
        item('Borrar imagen', 'clear', 'CmdOrCtrl+Shift+N'),
      ],
    },
    {
      label: 'Ver',
      submenu: [
        item('Acercar', 'zoomIn', 'CmdOrCtrl+='),
        item('Alejar', 'zoomOut', 'CmdOrCtrl+-'),
        item('Tamaño real', 'zoomReset', 'CmdOrCtrl+0'),
        item('Ajustar a la ventana', 'zoomFit', 'CmdOrCtrl+9'),
        sep,
        { role: 'togglefullscreen', label: 'Pantalla completa' },
      ],
    },
    ...(isMac ? [{ role: 'windowMenu', label: 'Ventana' }] : []),
    {
      role: 'help',
      label: 'Ayuda',
      submenu: [
        item('Atajos de teclado', 'shortcuts'),
        ...(isMac ? [] : [item('Acerca de Lienzo', 'about')]),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  app.setAboutPanelOptions({
    applicationName: 'Lienzo',
    applicationVersion: app.getVersion(),
    copyright: 'Software libre con licencia MIT',
  });
  buildMenu();
  createWindow();
  app.on('activate', () => { if (!win) createWindow(); });
});

app.on('window-all-closed', () => {
  if (!isMac) app.quit();
});
