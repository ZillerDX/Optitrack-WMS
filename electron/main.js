const { app, BrowserWindow, ipcMain, Tray, Menu, Notification, globalShortcut } = require('electron');
const path = require('path');
const http = require('http');
const net = require('net');
const { spawn } = require('child_process');

let mainWindow = null;
let tray = null;
let serverProcess = null;
let serverPort = null;

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

function checkPortOpen(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}`, (res) => {
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.abort();
      resolve(false);
    });
  });
}

function waitForServer(port, timeoutMs = 25000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const poll = () => {
      const req = http.get(`http://127.0.0.1:${port}`, (res) => {
        resolve(true);
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error('Server boot timeout'));
        } else {
          setTimeout(poll, 250);
        }
      });
      req.setTimeout(1000, () => {
        req.abort();
        if (Date.now() - start > timeoutMs) {
          reject(new Error('Server boot timeout'));
        } else {
          setTimeout(poll, 250);
        }
      });
    };
    poll();
  });
}

async function startEmbeddedServer() {
  const isDevRunning = await checkPortOpen(3000);
  if (isDevRunning) {
    console.log('Detected active Next.js development server on port 3000.');
    serverPort = 3000;
    return `http://localhost:3000`;
  }

  serverPort = await getFreePort();
  console.log(`Allocated port ${serverPort} for embedded standalone server.`);

  const serverDir = app.isPackaged
    ? path.join(process.resourcesPath, 'standalone')
    : path.resolve(__dirname, '..', 'frontend', '.next', 'standalone');

  const serverScript = 'server.js';
  console.log(`Embedded server directory: ${serverDir}`);

  serverProcess = spawn(process.execPath, [serverScript], {
    cwd: serverDir,
    env: {
      ...process.env,
      PORT: String(serverPort),
      HOSTNAME: '127.0.0.1',
      NODE_ENV: 'production',
      ELECTRON_RUN_AS_NODE: '1'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  serverProcess.stdout.on('data', (d) => console.log(`[Next.js]: ${d.toString().trim()}`));
  serverProcess.stderr.on('data', (d) => console.error(`[Next.js ERR]: ${d.toString().trim()}`));

  serverProcess.on('exit', (code, signal) => {
    console.log(`Next.js server exited. Code: ${code}, Signal: ${signal}`);
  });

  await waitForServer(serverPort);
  return `http://127.0.0.1:${serverPort}`;
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 700,
    frame: false, // Frameless for custom native desktop titlebar
    backgroundColor: '#020617',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  // Display Splash Screen immediately while engine initializes
  mainWindow.loadFile(path.join(__dirname, 'splash.html'));
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Track window maximize status for custom titlebar
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-maximized-status', true);
  });
  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-maximized-status', false);
  });

  try {
    const targetUrl = await startEmbeddedServer();
    console.log(`Loading application URL: ${targetUrl}`);
    mainWindow.loadURL(targetUrl);
  } catch (err) {
    console.error('Failed to start or load embedded server:', err);
    // Show error screen if server failed to start
    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
      <!DOCTYPE html>
      <html>
      <body style="background:#020617;color:#f8fafc;font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;">
        <h2 style="color:#ef4444;margin-bottom:10px;">Failed to Launch OptiTrack Engine</h2>
        <p style="color:#94a3b8;margin-bottom:20px;">${err.message}</p>
        <button onclick="location.reload()" style="background:#2563eb;color:#fff;border:none;padding:8px 18px;border-radius:8px;cursor:pointer;font-weight:600;">Retry</button>
      </body>
      </html>
    `)}`);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Handlers
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

function cleanup() {
  if (serverProcess) {
    console.log('Terminating embedded Next.js server...');
    try {
      serverProcess.kill('SIGTERM');
    } catch {}
    serverProcess = null;
  }
}

app.on('before-quit', cleanup);
app.on('will-quit', cleanup);

app.whenReady().then(() => {
  createWindow();

  // F12 DevTools Toggle
  globalShortcut.register('F12', () => {
    if (mainWindow) {
      mainWindow.webContents.toggleDevTools();
    }
  });

  // Tray Setup
  try {
    const iconPath = path.join(__dirname, 'tray-icon.png');
    tray = new Tray(iconPath);
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
          cleanup();
          app.quit();
        },
      },
    ]);
    tray.setToolTip('OptiTrack WMS Desktop');
    tray.setContextMenu(contextMenu);
  } catch {}

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  cleanup();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});