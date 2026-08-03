const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sb', {
  version: () => '0.1.0',
  listSounds: () => ipcRenderer.invoke('sounds:list'),
  getConfig: (name) => ipcRenderer.invoke('config:get', name),
  saveConfig: (name, config) => ipcRenderer.invoke('config:save', name, config),
  // El proceso principal avisa por acá cuando se presiona un atajo global.
  onHotkeyTrigger: (callback) => ipcRenderer.on('hotkey:trigger', (event, name) => callback(name))
});
