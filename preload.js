const { contextBridge, ipcRenderer } = require('electron');

/**
 * Expose safe, isolated APIs from Electron main to the renderer context.
 */
contextBridge.exposeInMainWorld('snappix', {
  /**
   * Save photo with native system Save Dialog.
   * Supports multiple call signatures:
   * - savePhoto(dataUrl, format)
   * - savePhoto(dataUrl, format, defaultName)
   * - savePhoto(dataUrl, defaultName, format)
   * - savePhoto({ dataUrl, format, defaultName })
   */
  savePhoto: (dataUrlOrOptions, arg2 = 'png', arg3) => {
    let payload = {};

    if (typeof dataUrlOrOptions === 'object' && dataUrlOrOptions !== null) {
      payload = dataUrlOrOptions;
    } else {
      let format = 'png';
      let defaultName = undefined;

      if (typeof arg2 === 'string') {
        if (arg2.includes('.') || arg2.length > 5) {
          // arg2 is defaultName, arg3 is format
          defaultName = arg2;
          format = typeof arg3 === 'string' ? arg3 : 'png';
        } else {
          // arg2 is format, arg3 is defaultName
          format = arg2;
          defaultName = arg3;
        }
      }

      payload = {
        dataUrl: dataUrlOrOptions,
        format,
        defaultName
      };
    }

    return ipcRenderer.invoke('save-photo', payload);
  },

  /**
   * Quick-save directly to ~/Pictures/Snappix/ without showing dialog
   */
  quickSave: (dataUrl, format = 'png', customName) =>
    ipcRenderer.invoke('quick-save-photo', { dataUrl, format, customName }),

  /**
   * Reveal file in macOS Finder / Windows File Explorer
   */
  openInFinder: (filePath) =>
    ipcRenderer.invoke('open-in-finder', filePath),

  /**
   * Alias for openInFinder
   */
  showInFolder: (filePath) =>
    ipcRenderer.invoke('open-in-finder', filePath),

  /**
   * Get user's Snappix pictures directory path
   */
  getPicturesDir: () =>
    ipcRenderer.invoke('get-pictures-dir'),

  /**
   * System metadata
   */
  platform: process.platform,
  isElectron: true
});


