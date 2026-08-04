const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sb', {
  version: () => '0.1.0',
  listSounds: () => ipcRenderer.invoke('sounds:list'),
  getConfig: (name) => ipcRenderer.invoke('config:get', name),
  saveConfig: (name, config) => ipcRenderer.invoke('config:save', name, config),
  // El proceso principal avisa por acá cuando se presiona un atajo global.
  onHotkeyTrigger: (callback) => ipcRenderer.on('hotkey:trigger', (event, name) => callback(name)),
  checkVBCable: () => ipcRenderer.invoke('vbcable:check'),
  openVBCableDownload: () => ipcRenderer.invoke('vbcable:open-download-page'),
  getOutputDevice: () => ipcRenderer.invoke('settings:get-output-device'),
  saveOutputDevice: (deviceId) => ipcRenderer.invoke('settings:save-output-device', deviceId),
  getMixer: () => ipcRenderer.invoke('settings:get-mixer'),
  saveMixer: (mixer) => ipcRenderer.invoke('settings:save-mixer', mixer)
});
