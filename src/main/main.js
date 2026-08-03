const { app, BrowserWindow, ipcMain, globalShortcut, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const Store = require('electron-store');

const SOUNDS_DIR = path.join(__dirname, '..', '..', 'assets', 'sounds');
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.flac'];

// Guarda la configuración de cada botón (color, volumen, atajo, loop)
// en un JSON manejado por electron-store, indexado por nombre de sonido.
const store = new Store({ name: 'sounds-config' });

let mainWindow;

function listSoundFiles() {
  if (!fs.existsSync(SOUNDS_DIR)) return [];

  return fs.readdirSync(SOUNDS_DIR)
    .filter((file) => AUDIO_EXTENSIONS.includes(path.extname(file).toLowerCase()))
    .map((file) => ({
      name: path.parse(file).name,
      path: 'file://' + path.join(SOUNDS_DIR, file).replace(/\\/g, '/')
    }));
}

function defaultConfig() {
  return { color: '#2d2d30', volume: 1, hotkey: '', loop: false };
}

// Consulta los dispositivos de audio de Windows vía PowerShell y busca
// si alguno corresponde a VB-CABLE (aparece como "CABLE Input" o
// contiene "VB-Audio" en el nombre).
function checkVBCable() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve({ supported: false, installed: false });
      return;
    }

    exec(
      'powershell -NoProfile -Command "Get-CimInstance Win32_SoundDevice | Select-Object -ExpandProperty Name"',
      { timeout: 8000 },
      (err, stdout) => {
        if (err) {
          resolve({ supported: true, installed: false, error: true });
          return;
        }
        const installed = /cable|vb-audio/i.test(stdout);
        resolve({ supported: true, installed });
      }
    );
  });
}

ipcMain.handle('vbcable:check', () => checkVBCable());
ipcMain.handle('vbcable:open-download-page', () => {
  shell.openExternal('https://vb-audio.com/Cable/');
});

// Configuración general de la app (no por sonido), como el dispositivo
// de salida elegido para reproducir los efectos.
ipcMain.handle('settings:get-output-device', () => store.get('outputDeviceId', ''));
ipcMain.handle('settings:save-output-device', (event, deviceId) => {
  store.set('outputDeviceId', deviceId);
  return true;
});

// Vuelve a registrar todos los atajos globales según la configuración
// guardada. Se llama al arrancar y cada vez que se guarda una config nueva.
// Devuelve un mapa { nombreSonido: true/false } indicando si cada atajo
// configurado quedó realmente registrado (puede fallar si otra app ya
// usa esa combinación).
function registerHotkeys() {
  globalShortcut.unregisterAll();
  const results = {};

  listSoundFiles().forEach((sound) => {
    const config = store.get(sound.name, defaultConfig());
    if (!config.hotkey) return;

    try {
      globalShortcut.register(config.hotkey, () => {
        if (mainWindow) mainWindow.webContents.send('hotkey:trigger', sound.name);
      });
      results[sound.name] = globalShortcut.isRegistered(config.hotkey);
    } catch (err) {
      results[sound.name] = false;
    }
  });

  return results;
}

ipcMain.handle('sounds:list', () => listSoundFiles());
ipcMain.handle('config:get', (event, name) => store.get(name, defaultConfig()));
ipcMain.handle('config:save', (event, name, config) => {
  store.set(name, config);
  const results = registerHotkeys();
  // Si no pusieron atajo, consideramos "registrado" (no aplica).
  const hotkeyOk = config.hotkey ? !!results[name] : true;
  return { ok: true, hotkeyRegistered: hotkeyOk };
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 700,
    minHeight: 500,
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'ui', 'index.html'));

  // Descomentar solo si necesitamos volver a diagnosticar algo:
  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  // Autoconcedemos el permiso de "media" para que el renderer pueda ver
  // los nombres reales de los dispositivos de audio (sin esto, Chromium
  // los devuelve con nombres genéricos por privacidad). No grabamos nada,
  // solo lo usamos para listar dispositivos de salida.
  const { session } = require('electron');
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(permission === 'media');
  });

  createWindow();
  registerHotkeys();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
