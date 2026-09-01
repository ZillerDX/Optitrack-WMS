const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  onMaximizeChange: (callback) => {
    ipcRenderer.on('window-maximized-status', (event, isMaximized) => {
      callback(isMaximized);
    });
  },
  showNotification: (title, body) => {
    ipcRenderer.send('show-notification', { title, body });
  },
  getAppVersion: () => ipcRenderer.invoke('get-app-version')
});
