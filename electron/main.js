const { app, BrowserWindow, ipcMain, Tray, Menu, Notification } = require('electron');
const path = require('path');
const http = require('http');

let mainWindow = null;
let tray = null;

const FRONTEND_PORT = process.env.PORT || 3000;
const DEV_URL = `http://localhost:${FRONTEND_PORT}`;

function isServerRunning(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}`, (res) => {
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.abort();
      resolve(false);
    });
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 700,
    frame: false, // Frameless for custom native-style desktop titlebar
    backgroundColor: '#020617',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Track maximize state for custom titlebar
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-maximized-status', true);
  });
  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-maximized-status', false);
  });

  // Load App: Check if dev/standalone server is reachable, or poll briefly
  const loadApp = async () => {
    const isRunning = await isServerRunning(FRONTEND_PORT);
    if (isRunning) {
      mainWindow.loadURL(DEV_URL);
    } else {
      // In case frontend server is still starting
      setTimeout(async () => {
        mainWindow.loadURL(DEV_URL);
      }, 2000);
    }
  };

  loadApp();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Handlers for custom frameless window controls
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.on('show-notification', (event, { title, body }) => {
  if (Notification.isSupported()) {
    new Notification({ title: title || 'OptiTrack WMS', body: body || '' }).show();
  }
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

// App Lifecycle
app.whenReady().then(() => {
  createWindow();

  // Create System Tray
  try {
    const iconPath = path.join(__dirname, 'tray-icon.png');
    tray = new Tray(iconPath);
  } catch {
    // If tray icon isn't generated yet, skip tray creation gracefully
  }

  if (tray) {
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Open OptiTrack WMS',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          } else {
            createWindow();
          }
        },
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          app.quit();
        },
      },
    ]);
    tray.setToolTip('OptiTrack WMS Desktop');
    tray.setContextMenu(contextMenu);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
