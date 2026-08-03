const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
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

// Vuelve a registrar todos los atajos globales según la configuración
// guardada. Se llama al arrancar y cada vez que se guarda una config nueva.
function registerHotkeys() {
  globalShortcut.unregisterAll();

  listSoundFiles().forEach((sound) => {
    const config = store.get(sound.name, defaultConfig());
    if (!config.hotkey) return;

    try {
      globalShortcut.register(config.hotkey, () => {
        if (mainWindow) mainWindow.webContents.send('hotkey:trigger', sound.name);
      });
    } catch (err) {
      console.error(`No se pudo registrar el atajo "${config.hotkey}" para "${sound.name}":`, err);
    }
  });
}

ipcMain.handle('sounds:list', () => listSoundFiles());
ipcMain.handle('config:get', (event, name) => store.get(name, defaultConfig()));
ipcMain.handle('config:save', (event, name, config) => {
  store.set(name, config);
  registerHotkeys();
  return true;
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
}

app.whenReady().then(() => {
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
