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

// Ensure user pictures folder exists
function getSnappixDir() {
  const dir = path.join(app.getPath('pictures'), 'Snappix');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

// Handle native photo saving with Save Dialog (custom path & format selection)
ipcMain.handle('save-photo', async (event, args = {}) => {
  try {
    const { dataUrl, format = 'png', defaultName } = args;
    if (!dataUrl) {
      return { success: false, error: 'No image data provided' };
    }

    const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const ext = format.toLowerCase().replace('.', '');
    const fallbackName = `snappix-${Date.now()}.${ext}`;
    const targetName = defaultName || fallbackName;

    // Ordered format filters (.png, .jpg, .webp)
    const formatFilters = [
      { name: 'PNG Image (*.png)', extensions: ['png'] },
      { name: 'JPEG Image (*.jpg;*.jpeg)', extensions: ['jpg', 'jpeg'] },
      { name: 'WebP Image (*.webp)', extensions: ['webp'] },
      { name: 'All Files (*.*)', extensions: ['*'] }
    ];

    // Ensure the requested format appears first as the active filter
    const primaryIdx = formatFilters.findIndex((f) => f.extensions.includes(ext));
    if (primaryIdx > 0) {
      const [primary] = formatFilters.splice(primaryIdx, 1);
      formatFilters.unshift(primary);
    }

    const { filePath, canceled } = await dialog.showSaveDialog({
      title: 'Save Snappix Photo',
      defaultPath: path.join(getSnappixDir(), targetName),
      filters: formatFilters
    });

    if (canceled || !filePath) {
      return { success: false, canceled: true };
    }

    // Ensure file extension matches selected format if omitted
    let finalPath = filePath;
    if (!path.extname(finalPath)) {
      finalPath = `${finalPath}.${ext}`;
    }

    await fs.promises.writeFile(finalPath, buffer);
    return { success: true, filePath: finalPath };
  } catch (err) {
    console.error('Failed to save photo:', err);
    return { success: false, error: err.message };
  }
});

// Quick-save directly to default OS directory (~/Pictures/Snappix/)
ipcMain.handle('quick-save-photo', async (event, args = {}) => {
  try {
    const { dataUrl, format = 'png', customName } = args;
    if (!dataUrl) return { success: false, error: 'No image data provided' };

    const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const ext = format.toLowerCase().replace('.', '');

    // Formatted timestamp: Snappix_YYYY-MM-DD_HH-mm-ss
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '-');
    const fileName = customName || `Snappix_${dateStr}_${timeStr}.${ext}`;
    const filePath = path.join(getSnappixDir(), fileName);

    await fs.promises.writeFile(filePath, buffer);
    return { success: true, filePath, fileName };
  } catch (err) {
    console.error('Quick save error:', err);
    return { success: false, error: err.message };
  }
});


// Reveal file in OS file manager (macOS Finder / Windows File Explorer)
ipcMain.handle('open-in-finder', async (event, filePath) => {
  try {
    if (filePath && fs.existsSync(filePath)) {
      shell.showItemInFolder(filePath);
      return true;
    }
    return false;
  } catch (err) {
    console.error('open-in-finder error:', err);
    return false;
  }
});

// Alias for compatibility
ipcMain.handle('show-in-folder', async (event, filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    shell.showItemInFolder(filePath);
    return true;
  }
  return false;
});

// Get Snappix pictures directory path
ipcMain.handle('get-pictures-dir', () => {
  return getSnappixDir();
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

