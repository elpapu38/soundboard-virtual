document.getElementById('version').textContent = `v${window.sb.version()}`;

const grid = document.getElementById('sound-grid');
const emptyMsg = document.getElementById('empty-msg');
const stopAllBtn = document.getElementById('stop-all-btn');

// --- Motor de mezcla (reemplaza a VoiceMeeter) ---
// Todo lo que suena (efectos + opcionalmente el micrófono) se conecta a
// este único "destino" de Web Audio. El resultado combinado se manda a
// un <audio> oculto cuyo dispositivo de salida elegimos (CABLE Input).
// latencyHint: 'playback' prioriza buffers más grandes (más estables,
// menos propensos a cortes/glitches) en vez de la mínima latencia
// posible. Para un soundboard, unos milisegundos extra no se notan;
// un corte o distorsión en el audio sí.
const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'playback' });
const mixDestination = audioCtx.createMediaStreamDestination();

const mixOutputEl = new Audio();
mixOutputEl.srcObject = mixDestination.stream;
// Importante: NO arrancamos la reproducción acá todavía. Si empezamos a
// sonar antes de aplicar el dispositivo de salida (CABLE Input), puede
// quedar sonando por los parlantes por defecto. Arranca recién después
// de aplicar el sinkId, más abajo en loadOutputDevices().

// Conecta un <audio> de un sonido al grafo de mezcla. Solo se puede
// llamar una vez por elemento (por eso loadSounds() recrea los <audio>
// cada vez que recarga la lista, en vez de reutilizarlos).
function connectSoundToMix(audio) {
  try {
    const node = audioCtx.createMediaElementSource(audio);
    node.connect(mixDestination);
  } catch (err) {
    console.error('No se pudo conectar el sonido a la mezcla:', err);
  }
}

// id ("categoría/nombre") -> { audio, config, btn, hotkeyLabel, id, name, category }
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
  // Volumen final = volumen individual del botón × volumen maestro.
  entry.audio.volume = entry.config.volume * masterVolume;
  entry.audio.muted = allMuted;
  entry.audio.loop = entry.config.loop;
  entry.audio.currentTime = 0;
  entry.audio.play().catch((err) => console.error('No se pudo reproducir:', err));
}

stopAllBtn.addEventListener('click', () => {
  sounds.forEach((entry) => stopSound(entry.id));
});

// --- Panel de configuración por sonido ---
let openPopover = null;

function closePopover() {
  if (openPopover) {
    openPopover.remove();
    openPopover = null;
  }
}

function applyButtonStyle(name) {
  const entry = sounds.get(name);
  entry.btn.style.background = entry.config.color;
  entry.hotkeyLabel.textContent = entry.config.hotkey || '';
}

function openConfigPopover(name, anchorBtn) {
  closePopover();

  const entry = sounds.get(name);
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
    // No hace nada "mágico": el valor del color ya está tomado en
    // colorInput.value en todo momento. Esto solo le da al usuario una
    // confirmación visual clara de que puede pasar a "Guardar" sin
    // preocuparse por el selector nativo de color.
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

    const result = await window.sb.deleteSound(name);
    if (result.ok) {
      closePopover();
      await loadSounds();
    } else {
      alert('No se pudo eliminar: ' + (result.error || 'error desconocido'));
    }
  });

  pop.querySelector('#cfg-save').addEventListener('click', async () => {
    const newConfig = {
      color: pop.querySelector('#cfg-color').value,
      volume: parseFloat(pop.querySelector('#cfg-volume').value),
      hotkey: capturedHotkey,
      loop: pop.querySelector('#cfg-loop').checked
    };
    const result = await window.sb.saveConfig(name, newConfig);
    entry.config = newConfig;
    applyButtonStyle(name);

    const warning = pop.querySelector('#cfg-hotkey-warning');
    if (result && result.hotkeyRegistered === false) {
      // El atajo quedó guardado pero no se pudo activar globalmente:
      // avisamos y dejamos el panel abierto para que prueben otra combinación.
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

// --- Carga inicial de sonidos ---
const categoryTabs = document.getElementById('category-tabs');
let activeCategory = 'Todos';

function renderCategoryTabs(categories) {
  categoryTabs.innerHTML = '';

  if (categories.length <= 1) {
    // Con una sola categoría (o ninguna) no tiene sentido mostrar pestañas.
    categoryTabs.style.display = 'none';
    return;
  }

  categoryTabs.style.display = 'flex';
  const allTabs = ['Todos', ...categories];

  allTabs.forEach((cat) => {
    const tab = document.createElement('button');
    tab.className = 'category-tab' + (cat === activeCategory ? ' active' : '');
    tab.textContent = cat;
    tab.addEventListener('click', () => {
      activeCategory = cat;
      renderCategoryTabs(categories);
      applyCategoryFilter();
    });
    categoryTabs.appendChild(tab);
  });
}

function applyCategoryFilter() {
  sounds.forEach((entry) => {
    const visible = activeCategory === 'Todos' || entry.category === activeCategory;
    entry.wrapper.style.display = visible ? '' : 'none';
  });
}

async function loadSounds() {
  const soundFiles = await window.sb.listSounds();

  if (soundFiles.length === 0) {
    emptyMsg.style.display = 'block';
    grid.style.display = 'none';
    categoryTabs.style.display = 'none';
    return;
  }

  emptyMsg.style.display = 'none';
  grid.style.display = 'grid';
  grid.innerHTML = '';
  sounds.clear();

  const categories = [...new Set(soundFiles.map((s) => s.category))];
  renderCategoryTabs(categories);

  for (const sound of soundFiles) {
    const config = await window.sb.getConfig(sound.id);
    const audio = new Audio(sound.path);
    connectSoundToMix(audio);

    const wrapper = document.createElement('div');
    wrapper.className = 'sound-btn-wrapper';

    const btn = document.createElement('button');
    btn.className = 'sound-btn';
    btn.textContent = sound.name;

    const gear = document.createElement('button');
    gear.className = 'cfg-gear';
    gear.textContent = '⚙';
    gear.title = 'Configurar';

    const hotkeyLabel = document.createElement('span');
    hotkeyLabel.className = 'hotkey-label';

    wrapper.appendChild(btn);
    wrapper.appendChild(gear);
    wrapper.appendChild(hotkeyLabel);
    grid.appendChild(wrapper);

    sounds.set(sound.id, {
      audio, config, btn, hotkeyLabel, wrapper,
      id: sound.id, name: sound.name, category: sound.category
    });

    audio.addEventListener('play', () => btn.classList.add('playing'));
    audio.addEventListener('pause', () => btn.classList.remove('playing'));
    audio.addEventListener('ended', () => btn.classList.remove('playing'));

    // Un clic: si está sonando, lo para. Si no, lo reproduce.
    btn.addEventListener('click', () => {
      if (audio.paused) {
        playSound(sound.id);
      } else {
        stopSound(sound.id);
      }
    });

    gear.addEventListener('click', (e) => {
      e.stopPropagation();
      openConfigPopover(sound.id, gear);
    });

    // Clic derecho sobre el botón también abre la configuración,
    // como acceso rápido sin tener que apuntarle al ⚙.
    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openConfigPopover(sound.id, btn);
    });

    applyButtonStyle(sound.id);
  }

  applyCategoryFilter();
}

// --- Agregar sonidos nuevos desde la app ---
const addSoundBtn = document.getElementById('add-sound-btn');

// Electron no soporta window.prompt() (solo alert/confirm tienen
// equivalente nativo), así que armamos un modal propio para pedir
// el nombre de categoría. Devuelve el texto ingresado, o null si
// cancelan.
function askCategoryName() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-box">
        <p>Nombre de la categoría (carpeta) para estos sonidos.<br>
        Dejalo vacío para agregarlos sin categoría (General).</p>
        <input type="text" id="category-name-input" placeholder="Ej: Memes">
        <div class="modal-actions">
          <button id="category-cancel-btn" type="button">Cancelar</button>
          <button id="category-accept-btn" type="button">Aceptar</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const input = overlay.querySelector('#category-name-input');
    input.focus();

    function finish(value) {
      overlay.remove();
      resolve(value);
    }

    overlay.querySelector('#category-cancel-btn').addEventListener('click', () => finish(null));
    overlay.querySelector('#category-accept-btn').addEventListener('click', () => finish(input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') finish(input.value);
      if (e.key === 'Escape') finish(null);
    });
  });
}

addSoundBtn.addEventListener('click', async () => {
  const category = await askCategoryName();

  // Si cancela, category viene null: no hacemos nada.
  if (category === null) return;

  const result = await window.sb.addSounds(category.trim() || 'General');
  if (result.canceled) return;

  if (result.ok) {
    await loadSounds();
  } else {
    alert('No se pudieron agregar los sonidos: ' + (result.error || 'error desconocido'));
  }
});

// Cuando el proceso principal detecta un atajo global, hacemos lo mismo
// que si hubieran hecho clic en el botón.
window.sb.onHotkeyTrigger((name) => {
  const entry = sounds.get(name);
  if (!entry) return;
  if (entry.audio.paused) {
    playSound(name);
  } else {
    stopSound(name);
  }
});

loadSounds();

// --- Estado del micrófono virtual (VB-CABLE) ---
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

vbDownloadBtn.addEventListener('click', () => {
  window.sb.openVBCableDownload();
});

vbRecheckBtn.addEventListener('click', () => {
  checkVBCable();
});

checkVBCable();

// --- Selector de dispositivo de salida (se aplica a la MEZCLA completa) ---
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
    // Pedimos permiso de audio una sola vez para poder ver los nombres
    // reales de los dispositivos. No grabamos ni usamos este stream de
    // prueba: es solo para desbloquear las etiquetas.
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

  // Recién ahora arrancamos a reproducir la mezcla, ya con el
  // dispositivo de salida correcto aplicado.
  mixOutputEl.play().catch((err) => console.error('[mezcla] No se pudo iniciar la reproducción:', err));
}

outputSelect.addEventListener('change', async () => {
  currentOutputDeviceId = outputSelect.value;
  await window.sb.saveOutputDevice(currentOutputDeviceId);
  await applyOutputDevice();
});

loadOutputDevices();

// --- Micrófono: capturarlo y mezclarlo con los efectos (reemplaza a VoiceMeeter) ---
const micEnabledCheckbox = document.getElementById('mic-enabled');
const micDeviceSelect = document.getElementById('mic-device-select');
const micVolumeSlider = document.getElementById('mic-volume');

const micGainNode = audioCtx.createGain();
micGainNode.connect(mixDestination);

// Medidor visual: tapea la señal del micrófono (después del volumen)
// para mostrar si realmente está entrando audio, sin depender de mirar
// otra app externa.
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
        // Desactivado a propósito: estos procesamientos están pensados
        // para un micrófono acústico común, y pueden distorsionar una
        // señal que ya viene procesada (como la de WO Mic, que llega
        // por red desde el celular).
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
  if (micEnabledCheckbox.checked) {
    await startMic(micDeviceSelect.value);
  }
  saveMicSettings();
});

micVolumeSlider.addEventListener('input', () => {
  micGainNode.gain.value = parseFloat(micVolumeSlider.value);
});

micVolumeSlider.addEventListener('change', () => {
  saveMicSettings();
});

async function loadMicSettings() {
  // Si todavía no se cargó la lista de dispositivos (puede pasar si esto
  // corre antes de que termine loadOutputDevices), la pedimos acá.
  if (allInputDevices.length === 0) {
    await refreshDeviceLists();
  }

  const mic = await window.sb.getMic();
  populateMicDeviceSelect(mic.deviceId);
  micVolumeSlider.value = mic.volume;
  micGainNode.gain.value = mic.volume;
  micEnabledCheckbox.checked = mic.enabled;

  if (mic.enabled) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    await startMic(mic.deviceId);
  }
}

loadMicSettings();

// --- Mezclador interno: volumen maestro y mute general ---
const masterVolumeSlider = document.getElementById('master-volume');
const muteAllBtn = document.getElementById('mute-all-btn');

// Aplica el estado actual (volumen maestro + mute) a todo lo que esté
// sonando en este momento, no solo a lo próximo que se reproduzca.
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

masterVolumeSlider.addEventListener('change', () => {
  saveMixer();
});

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
