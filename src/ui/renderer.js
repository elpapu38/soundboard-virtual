document.getElementById('version').textContent = `v${window.sb.version()}`;

const grid = document.getElementById('sound-grid');
const emptyMsg = document.getElementById('empty-msg');
const stopAllBtn = document.getElementById('stop-all-btn');

// --- Motor de mezcla (reemplaza a VoiceMeeter) ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'playback' });
const mixDestination = audioCtx.createMediaStreamDestination();

const masterLimiter = audioCtx.createDynamicsCompressor();
masterLimiter.threshold.value = -6;
masterLimiter.knee.value = 0;
masterLimiter.ratio.value = 20;
masterLimiter.attack.value = 0.003;
masterLimiter.release.value = 0.1;
masterLimiter.connect(mixDestination);

// Analizador solo para el mini-visualizador (no afecta el audio real).
const vizAnalyser = audioCtx.createAnalyser();
vizAnalyser.fftSize = 64;
masterLimiter.connect(vizAnalyser);

const mixOutputEl = new Audio();
mixOutputEl.srcObject = mixDestination.stream;

function connectSoundToMix(audio) {
  try {
    const node = audioCtx.createMediaElementSource(audio);
    node.connect(masterLimiter);
  } catch (err) {
    console.error('No se pudo conectar el sonido a la mezcla:', err);
  }
}

// id -> { audio, config, wrapper, playBtn, starBtn, hotkeyLabel, colorBar, id, name, category }
const sounds = new Map();

function stopSound(id) {
  const entry = sounds.get(id);
  if (!entry) return;
  entry.audio.pause();
  entry.audio.currentTime = 0;
}

let masterVolume = 1;
let allMuted = false;

function playSound(id) {
  const entry = sounds.get(id);
  if (!entry) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();
  entry.audio.volume = entry.config.volume * masterVolume;
  entry.audio.muted = allMuted;
  entry.audio.loop = entry.config.loop;
  entry.audio.currentTime = 0;
  entry.audio.play().catch((err) => console.error('No se pudo reproducir:', err));
}

stopAllBtn.addEventListener('click', () => {
  sounds.forEach((entry) => stopSound(entry.id));
});

// --- Mini reproductor / "sonando ahora" con visualizador ---
const nowPlayingBar = document.getElementById('now-playing-bar');
const nowPlayingName = document.getElementById('now-playing-name');
const nowPlayingStopBtn = document.getElementById('now-playing-stop-btn');
let currentlyPlayingId = null;

function updateNowPlayingBar() {
  if (currentlyPlayingId) {
    const entry = sounds.get(currentlyPlayingId);
    nowPlayingBar.style.display = 'flex';
    nowPlayingName.textContent = entry ? entry.name : '';
  } else {
    nowPlayingBar.style.display = 'none';
  }
}

nowPlayingStopBtn.addEventListener('click', () => {
  if (currentlyPlayingId) stopSound(currentlyPlayingId);
});

const vizCanvas = document.createElement('canvas');
vizCanvas.width = 120;
vizCanvas.height = 24;
vizCanvas.className = 'now-playing-viz';
nowPlayingBar.insertBefore(vizCanvas, nowPlayingStopBtn);
const vizCtx2d = vizCanvas.getContext('2d');
const vizData = new Uint8Array(vizAnalyser.frequencyBinCount);

function drawViz() {
  requestAnimationFrame(drawViz);
  if (!currentlyPlayingId) return;
  vizAnalyser.getByteFrequencyData(vizData);
  vizCtx2d.clearRect(0, 0, vizCanvas.width, vizCanvas.height);
  const barWidth = vizCanvas.width / vizData.length;
  for (let i = 0; i < vizData.length; i++) {
    const h = (vizData[i] / 255) * vizCanvas.height;
    vizCtx2d.fillStyle = getComputedStyle(document.body).getPropertyValue('--accent') || '#007acc';
    vizCtx2d.fillRect(i * barWidth, vizCanvas.height - h, barWidth - 1, h);
  }
}
drawViz();

// --- Panel de configuración (popover por sonido) ---
let openPopover = null;

function closePopover() {
  if (openPopover) {
    openPopover.remove();
    openPopover = null;
  }
}

function applyButtonStyle(id) {
  const entry = sounds.get(id);
  entry.playBtn.style.background = entry.config.color;
  entry.colorBar.style.background = entry.config.color;
  entry.hotkeyLabel.textContent = entry.config.hotkey || '';
  entry.starBtn.textContent = entry.config.favorite ? '★' : '☆';
  entry.starBtn.classList.toggle('active', !!entry.config.favorite);
}

function openConfigPopover(id, anchorBtn) {
  closePopover();

  const entry = sounds.get(id);
  const config = entry.config;

  const pop = document.createElement('div');
  pop.className = 'config-popover';
  pop.innerHTML = `
    <label>Color
      <div class="color-row">
        <input type="color" id="cfg-color" value="${config.color}">
        <button id="cfg-color-confirm" type="button">✓ Usar este color</button>
        <span id="cfg-color-confirmed" class="color-confirmed" style="display:none;">Aplicado ✓</span>
      </div>
    </label>
    <label>Volumen <input type="range" id="cfg-volume" min="0" max="1" step="0.05" value="${config.volume}"></label>
    <label>Atajo
      <input type="text" id="cfg-hotkey" value="${config.hotkey}" placeholder="Clic y presioná una tecla" readonly>
    </label>
    <p class="hotkey-hint">Sugerencia: Ctrl+Alt+Shift+Tecla casi nunca choca con otras apps.</p>
    <p class="hotkey-warning" id="cfg-hotkey-warning" style="display:none;">⚠ Ese atajo ya está en uso por otra app, probá otra combinación.</p>
    <label><input type="checkbox" id="cfg-loop" ${config.loop ? 'checked' : ''}> Repetir en bucle</label>
    <div class="popover-danger">
      <button id="cfg-delete" type="button">🗑 Eliminar sonido</button>
    </div>
    <div class="popover-actions">
      <button id="cfg-clear-hotkey" type="button">Quitar atajo</button>
      <button id="cfg-save" type="button">Guardar</button>
    </div>
  `;

  document.body.appendChild(pop);

  const rect = anchorBtn.getBoundingClientRect();
  pop.style.top = `${rect.bottom + window.scrollY + 6}px`;
  pop.style.left = `${rect.left + window.scrollX}px`;

  const colorInput = pop.querySelector('#cfg-color');
  const colorConfirmedLabel = pop.querySelector('#cfg-color-confirmed');

  pop.querySelector('#cfg-color-confirm').addEventListener('click', () => {
    colorInput.blur();
    colorConfirmedLabel.style.display = 'inline';
    setTimeout(() => { colorConfirmedLabel.style.display = 'none'; }, 1500);
  });

  const hotkeyInput = pop.querySelector('#cfg-hotkey');
  let capturedHotkey = config.hotkey;

  hotkeyInput.addEventListener('keydown', (e) => {
    e.preventDefault();
    if (['Control', 'Shift', 'Alt'].includes(e.key)) return;
    const parts = [];
    if (e.ctrlKey) parts.push('CommandOrControl');
    if (e.shiftKey) parts.push('Shift');
    if (e.altKey) parts.push('Alt');
    parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key);
    capturedHotkey = parts.join('+');
    hotkeyInput.value = capturedHotkey;
  });

  pop.querySelector('#cfg-clear-hotkey').addEventListener('click', () => {
    capturedHotkey = '';
    hotkeyInput.value = '';
  });

  pop.querySelector('#cfg-delete').addEventListener('click', async () => {
    const sure = confirm(`¿Eliminar "${entry.name}" definitivamente?\n\nEsto borra el archivo de audio y su configuración. No se puede deshacer.`);
    if (!sure) return;

    const result = await window.sb.deleteSound(id);
    if (result.ok) {
      closePopover();
      await loadSounds(true);
    } else {
      alert('No se pudo eliminar: ' + (result.error || 'error desconocido'));
    }
  });

  pop.querySelector('#cfg-save').addEventListener('click', async () => {
    const newConfig = {
      ...entry.config,
      color: pop.querySelector('#cfg-color').value,
      volume: parseFloat(pop.querySelector('#cfg-volume').value),
      hotkey: capturedHotkey,
      loop: pop.querySelector('#cfg-loop').checked
    };
    const result = await window.sb.saveConfig(id, newConfig);
    entry.config = newConfig;
    applyButtonStyle(id);

    const warning = pop.querySelector('#cfg-hotkey-warning');
    if (result && result.hotkeyRegistered === false) {
      warning.style.display = 'block';
    } else {
      closePopover();
    }
  });

  openPopover = pop;
}

document.addEventListener('click', (e) => {
  if (openPopover && !openPopover.contains(e.target) && !e.target.classList.contains('cfg-gear')) {
    closePopover();
  }
});

window.sb.onHotkeyTrigger((id) => {
  const entry = sounds.get(id);
  if (!entry) return;
  if (entry.audio.paused) {
    playSound(id);
  } else {
    stopSound(id);
  }
});

// --- VB-CABLE: detección ---
const vbBanner = document.getElementById('vbcable-banner');
const vbText = document.getElementById('vbcable-text');
const vbDownloadBtn = document.getElementById('vbcable-download-btn');
const vbRecheckBtn = document.getElementById('vbcable-recheck-btn');

async function checkVBCable() {
  const result = await window.sb.checkVBCable();
  if (!result.supported) {
    vbBanner.style.display = 'none';
    return;
  }
  vbBanner.style.display = 'flex';
  if (result.installed) {
    vbBanner.className = 'vbcable-banner ok';
    vbText.textContent = '✅ Micrófono virtual (VB-CABLE) detectado.';
    vbDownloadBtn.style.display = 'none';
  } else {
    vbBanner.className = 'vbcable-banner warn';
    vbText.textContent = result.error
      ? '⚠ No se pudo comprobar el micrófono virtual.'
      : '⚠ No se detectó VB-CABLE. Instalalo para enviar el audio a otras apps como micrófono.';
    vbDownloadBtn.style.display = 'inline-block';
  }
}

vbDownloadBtn.addEventListener('click', () => window.sb.openVBCableDownload());
vbRecheckBtn.addEventListener('click', () => checkVBCable());
checkVBCable();

// --- Selector de dispositivo de salida (aplica a la MEZCLA completa) ---
const outputSelect = document.getElementById('output-device-select');
let currentOutputDeviceId = '';

async function applyOutputDevice() {
  if (!currentOutputDeviceId || typeof mixOutputEl.setSinkId !== 'function') {
    console.warn('[mezcla] No hay dispositivo de salida elegido, o setSinkId no está disponible.');
    return;
  }
  try {
    await mixOutputEl.setSinkId(currentOutputDeviceId);
    console.log('[mezcla] Dispositivo de salida aplicado:', currentOutputDeviceId);
  } catch (err) {
    console.error('[mezcla] No se pudo aplicar el dispositivo de salida:', err);
  }
}

let allOutputDevices = [];
let allInputDevices = [];

async function refreshDeviceLists() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
  } catch (err) {
    console.error('No se pudo pedir permiso de audio:', err);
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  allOutputDevices = devices.filter((d) => d.kind === 'audiooutput');
  allInputDevices = devices.filter((d) => d.kind === 'audioinput');
}

async function loadOutputDevices() {
  await refreshDeviceLists();
  currentOutputDeviceId = await window.sb.getOutputDevice();

  outputSelect.innerHTML = '';
  allOutputDevices.forEach((device) => {
    const option = document.createElement('option');
    option.value = device.deviceId;
    option.textContent = device.label || `Dispositivo ${device.deviceId.slice(0, 6)}`;
    outputSelect.appendChild(option);
  });

  if (allOutputDevices.some((d) => d.deviceId === currentOutputDeviceId)) {
    outputSelect.value = currentOutputDeviceId;
  } else {
    currentOutputDeviceId = allOutputDevices[0] ? allOutputDevices[0].deviceId : '';
    outputSelect.value = currentOutputDeviceId;
  }

  await applyOutputDevice();
  mixOutputEl.play().catch((err) => console.error('[mezcla] No se pudo iniciar la reproducción:', err));
}

outputSelect.addEventListener('change', async () => {
  currentOutputDeviceId = outputSelect.value;
  await window.sb.saveOutputDevice(currentOutputDeviceId);
  await applyOutputDevice();
});

loadOutputDevices();

// --- Micrófono ---
const micEnabledCheckbox = document.getElementById('mic-enabled');
const micDeviceSelect = document.getElementById('mic-device-select');
const micVolumeSlider = document.getElementById('mic-volume');
const micVolumeValue = document.getElementById('mic-volume-value');

const micGainNode = audioCtx.createGain();
micGainNode.connect(masterLimiter);

const micAnalyser = audioCtx.createAnalyser();
micAnalyser.fftSize = 256;
micGainNode.connect(micAnalyser);
const micMeterFill = document.getElementById('mic-meter-fill');
const micMeterData = new Uint8Array(micAnalyser.frequencyBinCount);

function updateMicMeter() {
  micAnalyser.getByteTimeDomainData(micMeterData);
  let sumSquares = 0;
  for (let i = 0; i < micMeterData.length; i++) {
    const v = (micMeterData[i] - 128) / 128;
    sumSquares += v * v;
  }
  const rms = Math.sqrt(sumSquares / micMeterData.length);
  micMeterFill.style.width = Math.min(100, rms * 300) + '%';
  requestAnimationFrame(updateMicMeter);
}
updateMicMeter();

let micStream = null;
let micSourceNode = null;

async function startMic(deviceId) {
  await stopMic();
  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    });
    micSourceNode = audioCtx.createMediaStreamSource(micStream);
    micSourceNode.connect(micGainNode);
  } catch (err) {
    console.error('No se pudo capturar el micrófono:', err);
    alert('No se pudo activar el micrófono elegido: ' + err.message);
    micEnabledCheckbox.checked = false;
  }
}

async function stopMic() {
  if (micSourceNode) {
    micSourceNode.disconnect();
    micSourceNode = null;
  }
  if (micStream) {
    micStream.getTracks().forEach((track) => track.stop());
    micStream = null;
  }
}

function populateMicDeviceSelect(selectedId) {
  micDeviceSelect.innerHTML = '';
  allInputDevices.forEach((device) => {
    const option = document.createElement('option');
    option.value = device.deviceId;
    option.textContent = device.label || `Micrófono ${device.deviceId.slice(0, 6)}`;
    micDeviceSelect.appendChild(option);
  });
  if (allInputDevices.some((d) => d.deviceId === selectedId)) {
    micDeviceSelect.value = selectedId;
  }
}

async function saveMicSettings() {
  await window.sb.saveMic({
    deviceId: micDeviceSelect.value,
    enabled: micEnabledCheckbox.checked,
    volume: parseFloat(micVolumeSlider.value)
  });
}

micEnabledCheckbox.addEventListener('change', async () => {
  if (micEnabledCheckbox.checked) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    await startMic(micDeviceSelect.value);
  } else {
    await stopMic();
  }
  saveMicSettings();
});

micDeviceSelect.addEventListener('change', async () => {
  if (micEnabledCheckbox.checked) await startMic(micDeviceSelect.value);
  saveMicSettings();
});

micVolumeSlider.addEventListener('input', () => {
  micGainNode.gain.value = parseFloat(micVolumeSlider.value);
  micVolumeValue.textContent = Math.round(parseFloat(micVolumeSlider.value) * 100) + '%';
});

micVolumeSlider.addEventListener('change', () => saveMicSettings());

async function loadMicSettings() {
  if (allInputDevices.length === 0) await refreshDeviceLists();

  const mic = await window.sb.getMic();
  populateMicDeviceSelect(mic.deviceId);
  micVolumeSlider.value = mic.volume;
  micVolumeValue.textContent = Math.round(mic.volume * 100) + '%';
  micGainNode.gain.value = mic.volume;
  micEnabledCheckbox.checked = mic.enabled;

  if (mic.enabled) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    await startMic(mic.deviceId);
  }
}

loadMicSettings();

// --- Mezclador: volumen maestro y mute general ---
const masterVolumeSlider = document.getElementById('master-volume');
const muteAllBtn = document.getElementById('mute-all-btn');

function applyMixerToPlaying() {
  sounds.forEach((entry) => {
    entry.audio.volume = entry.config.volume * masterVolume;
    entry.audio.muted = allMuted;
  });
}

async function saveMixer() {
  await window.sb.saveMixer({ masterVolume, muted: allMuted });
}

function updateMuteButtonLabel() {
  muteAllBtn.textContent = allMuted ? '🔇 Efectos muteados' : '🔇 Mutear efectos';
  muteAllBtn.classList.toggle('active', allMuted);
}

masterVolumeSlider.addEventListener('input', () => {
  masterVolume = parseFloat(masterVolumeSlider.value);
  applyMixerToPlaying();
});
masterVolumeSlider.addEventListener('change', () => saveMixer());

muteAllBtn.addEventListener('click', () => {
  allMuted = !allMuted;
  updateMuteButtonLabel();
  applyMixerToPlaying();
  saveMixer();
});

async function loadMixer() {
  const mixer = await window.sb.getMixer();
  masterVolume = mixer.masterVolume;
  allMuted = mixer.muted;
  masterVolumeSlider.value = masterVolume;
  updateMuteButtonLabel();
}

loadMixer();

// --- Exportar / Importar biblioteca ---
const exportBtn = document.getElementById('export-btn');
const importBtn = document.getElementById('import-btn');

exportBtn.addEventListener('click', async () => {
  const result = await window.sb.exportLibrary();
  if (result.canceled) return;
  if (result.ok) {
    alert(`Biblioteca exportada correctamente a:\n${result.path}`);
  } else {
    alert('No se pudo exportar: ' + (result.error || 'error desconocido'));
  }
});

importBtn.addEventListener('click', async () => {
  const replace = confirm(
    '¿Cómo querés importar?\n\n' +
    'Aceptar = Reemplazar toda tu biblioteca actual por la importada\n' +
    'Cancelar = Fusionar (agregar/actualizar sin borrar lo que ya tenés)'
  );
  const mode = replace ? 'replace' : 'merge';
  const result = await window.sb.importLibrary(mode);
  if (result.canceled) return;
  if (result.ok) {
    alert('Biblioteca importada correctamente. La app se va a recargar.');
    location.reload();
  } else {
    alert('No se pudo importar: ' + (result.error || 'error desconocido'));
  }
});

// --- Panel de configuración (salida, mic, VB-CABLE) ---
const settingsBtn = document.getElementById('settings-btn');
const settingsPanel = document.getElementById('settings-panel');

settingsBtn.addEventListener('click', () => {
  const isOpen = settingsPanel.style.display !== 'none';
  settingsPanel.style.display = isOpen ? 'none' : 'flex';
});

// --- Tema: oscuro (por defecto) o morado ---
const themeCheckbox = document.getElementById('theme-toggle-checkbox');

themeCheckbox.addEventListener('change', async () => {
  const theme = themeCheckbox.checked ? 'purple' : 'dark';
  document.body.classList.toggle('theme-purple', theme === 'purple');
  await window.sb.saveTheme(theme);
});

async function loadTheme() {
  const theme = await window.sb.getTheme();
  themeCheckbox.checked = theme === 'purple';
  document.body.classList.toggle('theme-purple', theme === 'purple');
}

loadTheme();

// --- Carga de sonidos: carpetas + vista de lista (todos/favoritos/categoría) ---
const folderView = document.getElementById('folder-view');
const backToFoldersBtn = document.getElementById('back-to-folders-btn');
const viewAllBtn = document.getElementById('view-all-btn');
const viewFavoritesBtn = document.getElementById('view-favorites-btn');
const searchInput = document.getElementById('search-input');
const sortSelect = document.getElementById('sort-select');

let currentCategories = [];
let activeCategory = null;
let listFilter = { type: 'folders' };

function renderFolders() {
  folderView.innerHTML = '';
  currentCategories.forEach((cat) => {
    const tile = document.createElement('button');
    tile.className = 'folder-tile';
    tile.innerHTML = `<div class="folder-icon">📁</div><div class="folder-name">${cat}</div>`;
    tile.addEventListener('click', () => {
      activeCategory = cat;
      showListView({ type: 'category', value: cat });
    });
    folderView.appendChild(tile);
  });
}

function showFoldersView() {
  listFilter = { type: 'folders' };
  activeCategory = null;
  folderView.style.display = 'grid';
  grid.style.display = 'none';
  backToFoldersBtn.style.display = 'none';
  renderFolders();
}

function showListView(filter) {
  listFilter = filter;
  folderView.style.display = 'none';
  grid.style.display = 'grid';
  backToFoldersBtn.style.display = currentCategories.length > 1 ? 'inline-block' : 'none';
  applyFilters();
}

function applyFilters() {
  const search = searchInput.value.trim().toLowerCase();
  const visible = [];

  sounds.forEach((entry) => {
    let matches = true;
    if (listFilter.type === 'category') matches = entry.category === listFilter.value;
    else if (listFilter.type === 'favorites') matches = !!entry.config.favorite;
    // 'all' o 'folders' (cuando solo hay 1 categoría): no filtra por categoría.

    if (matches && search) {
      matches = entry.name.toLowerCase().includes(search);
    }

    entry.wrapper.style.display = matches ? '' : 'none';
    if (matches) visible.push(entry);
  });

  const sortValue = sortSelect.value;
  visible.sort((a, b) => sortValue === 'name-desc' ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name));
  visible.forEach((entry) => grid.appendChild(entry.wrapper));
}

backToFoldersBtn.addEventListener('click', showFoldersView);
viewAllBtn.addEventListener('click', () => { activeCategory = null; showListView({ type: 'all' }); });
viewFavoritesBtn.addEventListener('click', () => { activeCategory = null; showListView({ type: 'favorites' }); });
searchInput.addEventListener('input', () => { if (listFilter.type !== 'folders') applyFilters(); });
sortSelect.addEventListener('change', () => { if (listFilter.type !== 'folders') applyFilters(); });

async function toggleFavorite(id, entry) {
  const isFav = await window.sb.toggleFavorite(id);
  entry.config.favorite = isFav;
  entry.starBtn.textContent = isFav ? '★' : '☆';
  entry.starBtn.classList.toggle('active', isFav);
  if (listFilter.type === 'favorites') applyFilters();
}

async function loadSounds(preserveView) {
  const previousFilter = preserveView ? listFilter : null;
  const soundFiles = await window.sb.listSounds();

  if (soundFiles.length === 0) {
    emptyMsg.style.display = 'block';
    grid.style.display = 'none';
    folderView.style.display = 'none';
    backToFoldersBtn.style.display = 'none';
    return;
  }

  emptyMsg.style.display = 'none';
  grid.innerHTML = '';
  sounds.clear();

  currentCategories = [...new Set(soundFiles.map((s) => s.category))];

  for (const sound of soundFiles) {
    const config = await window.sb.getConfig(sound.id);
    const audio = new Audio(sound.path);
    connectSoundToMix(audio);

    const wrapper = document.createElement('div');
    wrapper.className = 'sound-card';

    const starBtn = document.createElement('button');
    starBtn.className = 'star-btn';
    starBtn.title = 'Favorito';

    const gear = document.createElement('button');
    gear.className = 'cfg-gear';
    gear.textContent = '⚙';
    gear.title = 'Configurar';

    const nameEl = document.createElement('div');
    nameEl.className = 'sound-name';
    nameEl.textContent = sound.name;

    const playBtn = document.createElement('button');
    playBtn.className = 'sound-play-btn';
    playBtn.textContent = '▶';

    const colorBar = document.createElement('div');
    colorBar.className = 'sound-color-bar';

    const hotkeyLabel = document.createElement('span');
    hotkeyLabel.className = 'hotkey-label';

    wrapper.appendChild(starBtn);
    wrapper.appendChild(gear);
    wrapper.appendChild(nameEl);
    wrapper.appendChild(playBtn);
    wrapper.appendChild(hotkeyLabel);
    wrapper.appendChild(colorBar);
    grid.appendChild(wrapper);

    const entry = {
      audio, config, wrapper, playBtn, starBtn, hotkeyLabel, colorBar,
      id: sound.id, name: sound.name, category: sound.category
    };
    sounds.set(sound.id, entry);

    audio.addEventListener('play', () => {
      wrapper.classList.add('playing');
      playBtn.textContent = '⏸';
      currentlyPlayingId = sound.id;
      updateNowPlayingBar();
    });
    audio.addEventListener('pause', () => {
      wrapper.classList.remove('playing');
      playBtn.textContent = '▶';
      if (currentlyPlayingId === sound.id) {
        currentlyPlayingId = null;
        updateNowPlayingBar();
      }
    });
    audio.addEventListener('ended', () => {
      wrapper.classList.remove('playing');
      playBtn.textContent = '▶';
      if (currentlyPlayingId === sound.id) {
        currentlyPlayingId = null;
        updateNowPlayingBar();
      }
    });

    wrapper.addEventListener('click', (e) => {
      if (e.target === starBtn || e.target === gear) return;
      if (audio.paused) playSound(sound.id); else stopSound(sound.id);
    });

    gear.addEventListener('click', (e) => {
      e.stopPropagation();
      openConfigPopover(sound.id, gear);
    });

    wrapper.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openConfigPopover(sound.id, gear);
    });

    starBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavorite(sound.id, entry);
    });

    applyButtonStyle(sound.id);
  }

  if (currentCategories.length <= 1) {
    activeCategory = null;
    folderView.style.display = 'none';
    backToFoldersBtn.style.display = 'none';
    grid.style.display = 'grid';
    listFilter = { type: 'all' };
    applyFilters();
  } else if (previousFilter && previousFilter.type === 'category' && currentCategories.includes(previousFilter.value)) {
    showListView(previousFilter);
  } else if (previousFilter && (previousFilter.type === 'all' || previousFilter.type === 'favorites')) {
    showListView(previousFilter);
  } else {
    showFoldersView();
  }
}

// --- Agregar sonidos nuevos ---
const addSoundBtn = document.getElementById('add-sound-btn');

function askCategoryFlow() {
  return new Promise((resolve) => {
    document.querySelectorAll('.modal-overlay').forEach((el) => el.remove());

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    document.body.appendChild(overlay);

    const existingFolders = currentCategories.filter((c) => c !== 'General');

    function finish(value) {
      overlay.remove();
      resolve(value);
    }

    function renderChoice() {
      overlay.innerHTML = `
        <div class="modal-box">
          <p>¿Dónde agregás estos sonidos?</p>
          <div class="modal-actions modal-actions-column">
            <button id="choice-general" type="button">Sin categoría (General)</button>
            ${existingFolders.length ? '<button id="choice-existing" type="button">Carpeta existente</button>' : ''}
            <button id="choice-new" type="button">Nueva carpeta</button>
            <button id="choice-cancel" type="button">Cancelar</button>
          </div>
        </div>
      `;
      overlay.querySelector('#choice-general').addEventListener('click', () => finish('General'));
      const existingBtn = overlay.querySelector('#choice-existing');
      if (existingBtn) existingBtn.addEventListener('click', renderExistingPicker);
      overlay.querySelector('#choice-new').addEventListener('click', renderNewFolder);
      overlay.querySelector('#choice-cancel').addEventListener('click', () => finish(null));
    }

    function renderExistingPicker() {
      overlay.innerHTML = `
        <div class="modal-box">
          <p>Elegí la carpeta:</p>
          <select id="existing-folder-select">
            ${existingFolders.map((c) => `<option value="${c}">${c}</option>`).join('')}
          </select>
          <div class="modal-actions">
            <button id="existing-back-btn" type="button">Atrás</button>
            <button id="existing-accept-btn" type="button">Aceptar</button>
          </div>
        </div>
      `;
      overlay.querySelector('#existing-back-btn').addEventListener('click', renderChoice);
      overlay.querySelector('#existing-accept-btn').addEventListener('click', () => {
        finish(overlay.querySelector('#existing-folder-select').value);
      });
    }

    function renderNewFolder() {
      overlay.innerHTML = `
        <div class="modal-box">
          <p>Nombre de la nueva carpeta:</p>
          <input type="text" id="new-folder-input" placeholder="Ej: Memes">
          <p class="hotkey-warning" id="new-folder-error" style="display:none;">⚠ Ya existe una carpeta con ese nombre.</p>
          <div class="modal-actions">
            <button id="new-back-btn" type="button">Atrás</button>
            <button id="new-accept-btn" type="button">Aceptar</button>
          </div>
        </div>
      `;
      const input = overlay.querySelector('#new-folder-input');
      setTimeout(() => input.focus(), 0);
      const errorMsg = overlay.querySelector('#new-folder-error');

      function tryAccept() {
        const name = input.value.trim();
        if (!name) return;
        const exists = currentCategories.some((c) => c.toLowerCase() === name.toLowerCase());
        if (exists) {
          errorMsg.style.display = 'block';
          return;
        }
        finish(name);
      }

      overlay.querySelector('#new-back-btn').addEventListener('click', renderChoice);
      overlay.querySelector('#new-accept-btn').addEventListener('click', tryAccept);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') tryAccept();
        if (e.key === 'Escape') finish(null);
      });
    }

    renderChoice();
  });
}

addSoundBtn.addEventListener('click', async () => {
  addSoundBtn.disabled = true;
  try {
    const category = await askCategoryFlow();
    if (category === null) return;

    const result = await window.sb.addSounds(category);
    if (result.canceled) return;

    if (result.ok) {
      await loadSounds(true);
    } else {
      alert('No se pudieron agregar los sonidos: ' + (result.error || 'error desconocido'));
    }
  } finally {
    addSoundBtn.disabled = false;
  }
});

loadSounds();
