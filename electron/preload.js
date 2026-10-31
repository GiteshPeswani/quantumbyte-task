/**
 * PeerConnect Electron Preload Script
 * Secure IPC bridge between Electron main process and vanilla JS renderer.
 * Strictly adheres to contextIsolation: true and nodeIntegration: false.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Request server configuration and app metadata from main process
   */
  getServerConfig: () => {
    return ipcRenderer.invoke('get-server-config');
  },

  /**
   * Safely write text to the system clipboard
   */
  copyToClipboard: (text) => {
    return ipcRenderer.invoke('copy-to-clipboard', text);
  },

  /**
   * Check if running inside Electron desktop container
   */
  isDesktop: true,

  /**
   * Listen for window or system events
   */
  onSystemMessage: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('system-message', handler);
    return () => ipcRenderer.removeListener('system-message', handler);
  }
});
