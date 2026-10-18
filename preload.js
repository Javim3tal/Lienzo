'use strict';
// Puente seguro entre la interfaz (renderer) y el proceso principal.

const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('lienzo', {
  platform: process.platform,
  openDialog: () => ipcRenderer.invoke('open-dialog'),
  openPath: (file) => ipcRenderer.invoke('open-path', file),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  saveDialog: (defaultName) => ipcRenderer.invoke('save-dialog', defaultName),
  writeFile: (file, bytes) => ipcRenderer.invoke('write-file', file, bytes),
  setState: (s) => ipcRenderer.send('set-state', s),
  confirmDiscard: () => ipcRenderer.invoke('confirm-discard'),
  closeNow: () => ipcRenderer.send('close-now'),
  readClipboardImage: () => ipcRenderer.invoke('clipboard-read'),
  writeClipboardImage: (dataUrl) => ipcRenderer.invoke('clipboard-write', dataUrl),
  nativeEdit: (cmd) => ipcRenderer.send('native-edit', cmd),
  onMenu: (cb) => ipcRenderer.on('menu', (_e, cmd) => cb(cmd)),
  onOpenData: (cb) => ipcRenderer.on('open-data', (_e, data) => cb(data)),
  ready: () => ipcRenderer.send('renderer-ready'),
});
