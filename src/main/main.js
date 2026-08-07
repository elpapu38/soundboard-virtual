const { app, BrowserWindow, ipcMain, globalShortcut, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { pathToFileURL } = require('url');
const Store = require('electron-store');
const AdmZip = require('adm-zip');
const { autoUpdater } = require('electron-updater');

const SOUNDS_DIR = path.join(__dirname, '..', '..', 'assets', 'sounds');
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.flac'];

// Guarda la configuración de cada botón (color, volumen, atajo, loop)
// en un JSON manejado por electron-store, indexado por nombre de sonido.
const store = new Store({ name: 'sounds-config' });

let mainWindow;

// Escanea assets/sounds. Los archivos sueltos en la raíz van a la
// categoría "General"; cada subcarpeta (un solo nivel) es su propia
// categoría. El "id" es único (categoría/nombre) y es lo que usamos
// para guardar configuración y registrar atajos; "name" es solo lo
// que se muestra en el botón.
function listSoundFiles() {
  if (!fs.existsSync(SOUNDS_DIR)) return [];

  const results = [];

  function addFile(filePath, category) {
    const ext = path.extname(filePath).toLowerCase();
    if (!AUDIO_EXTENSIONS.includes(ext)) return;
    const name = path.parse(filePath).name;
    const id = category === 'General' ? name : `${category}/${name}`;
    results.push({
      id,
      name,
      category,
      path: pathToFileURL(filePath).href,
      fullPath: filePath
    });
  }

  fs.readdirSync(SOUNDS_DIR, { withFileTypes: true }).forEach((entry) => {
    const fullPath = path.join(SOUNDS_DIR, entry.name);
    if (entry.isDirectory()) {
      fs.readdirSync(fullPath).forEach((file) => addFile(path.join(fullPath, file), entry.name));
    } else {
      addFile(fullPath, 'General');
    }
  });

  return results;
}

function defaultConfig() {
  return { color: '#2d2d30', volume: 1, hotkey: '', loop: false, favorite: false };
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

// Abre el explorador para elegir uno o varios archivos de audio y los
// copia dentro de assets/sounds (o de una subcarpeta, si se pasa categoría).
// Si ya existe un archivo con el mismo nombre, le agrega un sufijo
// numérico en vez de sobrescribirlo sin avisar.
ipcMain.handle('sounds:add', async (event, category) => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Agregar sonidos',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'flac'] }]
  });

  if (canceled || filePaths.length === 0) return { ok: false, canceled: true };

  const targetDir = category && category !== 'General'
    ? path.join(SOUNDS_DIR, category)
    : SOUNDS_DIR;

  fs.mkdirSync(targetDir, { recursive: true });

  let added = 0;
  filePaths.forEach((filePath) => {
    const ext = path.extname(filePath);
    const base = path.parse(filePath).name;
    let destPath = path.join(targetDir, base + ext);
    let counter = 2;

    while (fs.existsSync(destPath)) {
      destPath = path.join(targetDir, `${base} (${counter})${ext}`);
      counter++;
    }

    fs.copyFileSync(filePath, destPath);
    added++;
  });

  return { ok: true, added };
});

// Borra el archivo de audio del disco y su configuración guardada
// (color, volumen, atajo). También refresca los atajos globales por si
// el sonido borrado tenía uno registrado.
ipcMain.handle('sounds:delete', (event, id) => {
  const sound = listSoundFiles().find((s) => s.id === id);
  if (!sound) return { ok: false, error: 'No se encontró el sonido.' };

  try {
    fs.unlinkSync(sound.fullPath);
    store.delete(id);
    registerHotkeys();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// Configuración general de la app (no por sonido), como el dispositivo
// de salida elegido para reproducir los efectos.
ipcMain.handle('settings:get-output-device', () => store.get('outputDeviceId', ''));
ipcMain.handle('settings:save-output-device', (event, deviceId) => {
  store.set('outputDeviceId', deviceId);
  return true;
});
ipcMain.handle('settings:get-mixer', () => store.get('mixer', { masterVolume: 1, muted: false }));
ipcMain.handle('settings:save-mixer', (event, mixer) => {
  store.set('mixer', mixer);
  return true;
});
ipcMain.handle('settings:get-mic', () => store.get('mic', { deviceId: '', enabled: false, volume: 1.5 }));
ipcMain.handle('settings:save-mic', (event, mic) => {
  store.set('mic', mic);
  return true;
});
ipcMain.handle('sounds:toggle-favorite', (event, id) => {
  const config = store.get(id, defaultConfig());
  config.favorite = !config.favorite;
  store.set(id, config);
  return config.favorite;
});
ipcMain.handle('settings:get-theme', () => store.get('theme', 'dark'));
ipcMain.handle('settings:save-theme', (event, theme) => {
  store.set('theme', theme);
  return true;
});

// Agrega recursivamente una carpeta del disco a una carpeta dentro del zip.
function addDirToZip(zip, dirPath, zipFolder) {
  if (!fs.existsSync(dirPath)) return;
  fs.readdirSync(dirPath, { withFileTypes: true }).forEach((entry) => {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      addDirToZip(zip, fullPath, `${zipFolder}/${entry.name}`);
    } else {
      zip.addLocalFile(fullPath, zipFolder);
    }
  });
}

ipcMain.handle('library:export', async () => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Exportar biblioteca',
    defaultPath: path.join(app.getPath('documents'), `soundboard-export-${Date.now()}.zip`),
    filters: [{ name: 'Soundboard Export', extensions: ['zip'] }]
  });

  if (canceled || !filePath) return { ok: false, canceled: true };

  try {
    const zip = new AdmZip();
    addDirToZip(zip, SOUNDS_DIR, 'sounds');
    // store.store trae TODA la configuración guardada: por sonido,
    // mezclador, dispositivo de salida, etc.
    zip.addFile('config.json', Buffer.from(JSON.stringify(store.store, null, 2)));
    zip.writeZip(filePath);
    return { ok: true, path: filePath };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('library:import', async (event, mode) => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Importar biblioteca',
    properties: ['openFile'],
    filters: [{ name: 'Soundboard Export', extensions: ['zip'] }]
  });

  if (canceled || filePaths.length === 0) return { ok: false, canceled: true };

  try {
    const zip = new AdmZip(filePaths[0]);
    const entries = zip.getEntries();

    // "replace": borra todo lo que había antes de extraer lo nuevo.
    // "merge": solo agrega/sobrescribe lo que trae el zip, sin tocar el resto.
    if (mode === 'replace' && fs.existsSync(SOUNDS_DIR)) {
      fs.rmSync(SOUNDS_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(SOUNDS_DIR, { recursive: true });

    entries.forEach((entry) => {
      if (!entry.isDirectory && entry.entryName.startsWith('sounds/')) {
        const relative = entry.entryName.substring('sounds/'.length);
        const destPath = path.join(SOUNDS_DIR, relative);
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.writeFileSync(destPath, entry.getData());
      }
    });

    const configEntry = zip.getEntry('config.json');
    if (configEntry) {
      const importedConfig = JSON.parse(configEntry.getData().toString('utf8'));
      if (mode === 'replace') {
        store.clear();
      }
      Object.keys(importedConfig).forEach((key) => {
        store.set(key, importedConfig[key]);
      });
    }

    registerHotkeys();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
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
    const config = store.get(sound.id, defaultConfig());
    if (!config.hotkey) return;

    try {
      globalShortcut.register(config.hotkey, () => {
        if (mainWindow) mainWindow.webContents.send('hotkey:trigger', sound.id);
      });
      results[sound.id] = globalShortcut.isRegistered(config.hotkey);
    } catch (err) {
      results[sound.id] = false;
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
    icon: path.join(__dirname, '..', '..', 'assets', 'icons', 'icon.png'),
    webPreferences: {
      // Sin esto, Electron le baja prioridad de procesamiento a la
      // ventana cuando no está en foco (ej: mirando Discord en vez del
      // SoundBoard) — eso corta/entrecorta el audio de la mezcla justo
      // en el caso de uso real de esta app.
      backgroundThrottling: false,
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

  // Chequea actualizaciones contra las Releases públicas de GitHub.
  // Si hay una nueva, la descarga sola en segundo plano.
  autoUpdater.checkForUpdates();
});

autoUpdater.on('update-available', (info) => {
  if (mainWindow) {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Actualización disponible',
      message: `Hay una nueva versión (${info.version}) descargándose en segundo plano. Te avisamos cuando esté lista para instalar.`
    });
  }
});

autoUpdater.on('update-downloaded', () => {
  if (!mainWindow) return;
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Actualización lista',
    message: 'Se descargó una nueva versión de SoundBoard Virtual.',
    detail: '¿Reiniciar ahora para instalarla, o más tarde?',
    buttons: ['Reiniciar ahora', 'Más tarde'],
    defaultId: 0
  }).then((result) => {
    if (result.response === 0) autoUpdater.quitAndInstall();
  });
});

autoUpdater.on('error', (err) => {
  console.error('Error de auto-actualización:', err);
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
