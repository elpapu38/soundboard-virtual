document.getElementById('version').textContent = `v${window.sb.version()}`;

const grid = document.getElementById('sound-grid');
const emptyMsg = document.getElementById('empty-msg');
const stopAllBtn = document.getElementById('stop-all-btn');

// name -> { audio, config, btn, hotkeyLabel, name }
const sounds = new Map();

function stopSound(name) {
  const entry = sounds.get(name);
  if (!entry) return;
  entry.audio.pause();
  entry.audio.currentTime = 0;
}

function playSound(name) {
  const entry = sounds.get(name);
  if (!entry) return;
  entry.audio.volume = entry.config.volume;
  entry.audio.loop = entry.config.loop;
  entry.audio.currentTime = 0;
  entry.audio.play().catch((err) => console.error('No se pudo reproducir:', err));
}

stopAllBtn.addEventListener('click', () => {
  sounds.forEach((entry) => stopSound(entry.name));
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
    <label>Color <input type="color" id="cfg-color" value="${config.color}"></label>
    <label>Volumen <input type="range" id="cfg-volume" min="0" max="1" step="0.05" value="${config.volume}"></label>
    <label>Atajo
      <input type="text" id="cfg-hotkey" value="${config.hotkey}" placeholder="Clic y presioná una tecla" readonly>
    </label>
    <label><input type="checkbox" id="cfg-loop" ${config.loop ? 'checked' : ''}> Repetir en bucle</label>
    <div class="popover-actions">
      <button id="cfg-clear-hotkey" type="button">Quitar atajo</button>
      <button id="cfg-save" type="button">Guardar</button>
    </div>
  `;

  document.body.appendChild(pop);

  const rect = anchorBtn.getBoundingClientRect();
  pop.style.top = `${rect.bottom + window.scrollY + 6}px`;
  pop.style.left = `${rect.left + window.scrollX}px`;

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

  pop.querySelector('#cfg-save').addEventListener('click', async () => {
    const newConfig = {
      color: pop.querySelector('#cfg-color').value,
      volume: parseFloat(pop.querySelector('#cfg-volume').value),
      hotkey: capturedHotkey,
      loop: pop.querySelector('#cfg-loop').checked
    };
    await window.sb.saveConfig(name, newConfig);
    entry.config = newConfig;
    applyButtonStyle(name);
    closePopover();
  });

  openPopover = pop;
}

document.addEventListener('click', (e) => {
  if (openPopover && !openPopover.contains(e.target) && !e.target.classList.contains('cfg-gear')) {
    closePopover();
  }
});

// --- Carga inicial de sonidos ---
async function loadSounds() {
  const soundFiles = await window.sb.listSounds();

  if (soundFiles.length === 0) {
    emptyMsg.style.display = 'block';
    grid.style.display = 'none';
    return;
  }

  emptyMsg.style.display = 'none';
  grid.style.display = 'grid';
  grid.innerHTML = '';

  for (const sound of soundFiles) {
    const config = await window.sb.getConfig(sound.name);
    const audio = new Audio(sound.path);

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

    sounds.set(sound.name, { audio, config, btn, hotkeyLabel, name: sound.name });

    audio.addEventListener('play', () => btn.classList.add('playing'));
    audio.addEventListener('pause', () => btn.classList.remove('playing'));
    audio.addEventListener('ended', () => btn.classList.remove('playing'));

    // Un clic: si está sonando, lo para. Si no, lo reproduce.
    btn.addEventListener('click', () => {
      if (audio.paused) {
        playSound(sound.name);
      } else {
        stopSound(sound.name);
      }
    });

    gear.addEventListener('click', (e) => {
      e.stopPropagation();
      openConfigPopover(sound.name, gear);
    });

    applyButtonStyle(sound.name);
  }
}

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
