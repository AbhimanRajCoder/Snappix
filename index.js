const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 850,
    minWidth: 900,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadURL('http://localhost:5173/');

  // Optional: Open DevTools while developing
  // mainWindow.webContents.openDevTools();
}

// Handle native photo saving
ipcMain.handle('save-photo', async (event, { dataUrl, defaultName = 'snappix-photo.png', format = 'png' }) => {
  try {
    const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    const ext = format.toLowerCase();
    const { filePath, canceled } = await dialog.showSaveDialog({
      title: 'Save Snappix Photo',
      defaultPath: defaultName,
      filters: [
        { name: `${ext.toUpperCase()} Image`, extensions: [ext] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (canceled || !filePath) {
      return { success: false, canceled: true };
    }

    await fs.promises.writeFile(filePath, buffer);
    return { success: true, filePath };
  } catch (err) {
    console.error('Failed to save photo:', err);
    return { success: false, error: err.message };
  }
});

// Reveal file in OS file manager (Finder / File Explorer)
ipcMain.handle('show-in-folder', async (event, filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    shell.showItemInFolder(filePath);
    return true;
  }
  return false;
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

