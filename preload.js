const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('snappix', {
  savePhoto: (dataUrl, defaultName, format) =>
    ipcRenderer.invoke('save-photo', { dataUrl, defaultName, format }),
  showInFolder: (filePath) =>
    ipcRenderer.invoke('show-in-folder', filePath),
  isElectron: true
});

