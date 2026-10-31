/**
 * PeerConnect Electron Main Process
 * Handles application lifecycle, BrowserWindow initialization,
 * system media permissions, and secure IPC handling.
 */

require('dotenv').config();
const { app, BrowserWindow, session, ipcMain, clipboard, systemPreferences } = require('electron');
const path = require('path');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 840,
    minWidth: 920,
    minHeight: 680,
    title: 'PeerConnect - P2P Video Conferencing',
    backgroundColor: '#121214',
    show: false, // Wait until ready-to-show to prevent visual flash
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  });

  // Load the renderer HTML interface
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Configure Camera and Microphone Permission Handlers
 * Crucial for WebRTC desktop applications in Chromium/Electron.
 */
function setupMediaPermissions() {
  // Handle permission requests dynamically (getUserMedia camera/mic requests)
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const grantedPermissions = [
      'media',
      'mediaKeySystem',
      'notifications',
      'clipboard-read',
      'clipboard-sanitized-write'
    ];

    if (grantedPermissions.includes(permission)) {
      console.log(`[Permission Request] Granted: ${permission}`);
      return callback(true);
    }

    console.log(`[Permission Request] Denied: ${permission}`);
    callback(false);
  });

  // Handle permission checks
  session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
    if (permission === 'media') {
      return true;
    }
    return true;
  });

  // macOS specific media access prompt if applicable
  if (process.platform === 'darwin') {
    systemPreferences.askForMediaAccess('camera').then((granted) => {
      console.log(`[macOS Camera Access] ${granted ? 'Granted' : 'Denied'}`);
    }).catch(console.error);

    systemPreferences.askForMediaAccess('microphone').then((granted) => {
      console.log(`[macOS Microphone Access] ${granted ? 'Granted' : 'Denied'}`);
    }).catch(console.error);
  }
}

/**
 * Register IPC Handlers
 */
function setupIpcHandlers() {
  // Returns server configuration
  ipcMain.handle('get-server-config', async () => {
    return {
      serverUrl: process.env.SIGNALING_SERVER_URL || 'http://localhost:3000',
      platform: process.platform,
      version: app.getVersion()
    };
  });

  // Safe clipboard writing
  ipcMain.handle('copy-to-clipboard', async (event, text) => {
    if (typeof text === 'string') {
      clipboard.writeText(text);
      return true;
    }
    return false;
  });
}

// App lifecycle
app.whenReady().then(() => {
  setupMediaPermissions();
  setupIpcHandlers();
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
