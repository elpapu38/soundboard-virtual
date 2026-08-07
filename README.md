# 🎵 SoundBoard Virtual

Aplicación de escritorio para Windows que reproduce efectos de sonido y música hacia un **micrófono virtual**, para que Discord, juegos, Zoom, OBS o cualquier app que use micrófono los reciba como si vinieran de tu propia voz. Incluye además **mezcla de micrófono en vivo** (tu voz + los efectos, todo junto, sin depender de programas externos como VoiceMeeter).

---

## ✨ Funcionalidades

### Reproducción y organización
- Reproducción instantánea de sonidos (mp3, wav, ogg, flac).
- Botones con **color personalizado**, **volumen individual**, **atajo de teclado global** (funciona con la ventana minimizada) y modo **bucle**.
- **Carpetas/categorías**: organizá tus sonidos en carpetas dentro de `assets/sounds`, navegables desde la app.
- **Favoritos** (⭐) y vista rápida de "Todos los sonidos".
- **Buscador** y orden A-Z / Z-A.
- Agregar sonidos nuevos desde la propia app (con selector de carpeta existente o nueva, y aviso si el nombre ya existe).
- Eliminar sonidos desde la app (borra el archivo y su configuración).
- **Exportar/Importar biblioteca completa** (sonidos + configuración) como un solo `.zip`, para respaldar o migrar a otra PC.

### Audio y mezcla
- Selector de **dispositivo de salida** (para mandar el audio a un micrófono virtual como VB-CABLE en vez de tus parlantes).
- **Mezcla de micrófono en vivo**: captura tu micrófono (funciona con micrófonos físicos o virtuales, como WO Mic) y lo combina con los efectos en un solo stream de salida — reemplaza la necesidad de VoiceMeeter para este uso.
- Medidor visual de nivel de micrófono, control de volumen del mic (hasta 300%, con limitador automático anti-distorsión).
- Volumen maestro y "Mutear efectos" general.
- **Detección automática de VB-CABLE** (el driver de micrófono virtual), con acceso directo a la descarga oficial si falta.

### Interfaz
- Tema oscuro / morado, intercambiable.
- Panel de configuración separado (salida de audio, micrófono, estado de VB-CABLE).
- Mini-reproductor fijo abajo con visualizador en vivo de lo que está sonando.

### Mantenimiento
- **Auto-actualización**: la app chequea sola si hay una versión nueva publicada en GitHub, la descarga, y pregunta si reiniciar para instalarla.
- Ícono propio de la aplicación.

---

## 🚀 Instalación (para usar la app)

1. Andá a la sección [Releases](../../releases) del repositorio.
2. Descargá el `.exe` más reciente (ej. `SoundBoard Virtual Setup X.X.X.exe`).
3. Ejecutalo. Windows puede mostrar un aviso de **"Editor desconocido"** — es normal en apps personales sin certificado pago: click en "Más información" → "Ejecutar de todas formas".
4. Instalá normalmente. La app va a aparecer en el menú de inicio.
5. Las próximas versiones se instalan solas: la app te va a avisar cuando haya una nueva.

### Requisito: micrófono virtual (VB-CABLE)

Para que otras apps (Discord, juegos) puedan "escuchar" el SoundBoard como si fuera un micrófono, hace falta instalar el driver gratuito **VB-CABLE**:

- La app te avisa sola si no lo tenés instalado (panel de Configuración), con un botón directo a la descarga oficial: https://vb-audio.com/Cable/
- Instalalo como administrador (es un driver, Windows lo va a pedir). Puede requerir reiniciar Windows.
- Una vez instalado, en el selector de **salida de audio** de la app, elegí **"CABLE Input (VB-Audio Virtual Cable)"**.

---

## 🎙️ Configurar Discord para que suene bien

Como CABLE Output no es un micrófono acústico normal, los filtros de voz de Discord (pensados para una voz real) pueden distorsionar o "recortar" el audio de los efectos. Para evitarlo:

1. Discord → **Configuración de Usuario** → **Voz y Video**.
2. **Dispositivo de entrada**: elegí `CABLE Output (VB-Audio Virtual Cable)`.
3. **Supresión de ruido**: cambiala de "Voice Focus" o "Krisp" a **"Estándar"** (los modos avanzados de IA tienden a tratar los efectos de sonido como "ruido" y los atenúan).
4. **Cancelación de eco**: **desactivala**. Está pensada para evitar que tu propio parlante se retroalimente con tu micrófono, algo que no aplica acá y puede introducir distorsión.
5. (Opcional) Control automático de ganancia: si notás que el volumen "bombea" o sube y baja solo, probá desactivarlo también y ajustar el volumen manualmente desde la app.
6. Sensibilidad de entrada: si usás detección automática de voz, dejala en manual o baja — la mezcla (voz + efectos) varía más de volumen que una voz sola, y puede cortarse con el umbral automático.

Esta misma configuración aplica a **cualquier app** que uses con CABLE Output como micrófono (juegos con chat de voz, Zoom, etc.), no solo Discord.

---

## 🛠️ Desarrollo

### Requisitos
- Node.js instalado.
- Windows (la detección de VB-CABLE y los atajos globales están pensados para Windows).

### Correr en modo desarrollo
```
npm install
npm start
```

### Compilar el instalador
```
npm run build
```
El instalador queda en `dist/SoundBoard Virtual Setup X.X.X.exe`.

### Publicar una nueva versión (con auto-actualización)
1. Subí el número de `version` en `package.json`.
2. Seteá tu token de GitHub (con permiso de escritura sobre el repo) en la sesión de terminal:
   ```
   set GH_TOKEN=tu_token
   ```
3. Publicá:
   ```
   npm run release
   ```
   Esto compila y sube el instalador directo a una Release de GitHub (no como borrador), que es lo que la app va a detectar automáticamente.

### Estructura del proyecto
```
soundboard-virtual/
├── assets/
│   ├── sounds/        # Tus sonidos (no se sube al repo, es contenido personal)
│   └── icons/         # Ícono de la app
├── config/            # Configuración guardada (no se sube al repo)
├── exports/           # Zips exportados (no se sube al repo)
├── src/
│   ├── main/           # Proceso principal de Electron (main.js, preload.js)
│   └── ui/             # Interfaz (index.html, renderer.js, styles.css)
└── package.json
```

---

## 🗺️ Posibles mejoras a futuro

### Grandes
- **Editor de audio integrado**: recortar un sonido (con forma de onda visual) antes de agregarlo a la biblioteca, incluyendo un flujo para revisar varios archivos a la vez o aprobarlos todos sin editar.
- Barra lateral fija con categorías, favoritos y recientes siempre visibles (en vez de navegar entrando y saliendo de carpetas).
- Panel de detalle lateral (forma de onda, controles) en vez del panel flotante actual.
- Sistema de "Recientes" (últimos sonidos reproducidos).

### Medianas
- Mostrar la duración de cada sonido en su tarjeta.
- Ícono/emoji elegible por sonido (no solo color).
- Barra de progreso animada en tiempo real mientras suena un sonido (hoy es solo decorativa).
- Vista en lista, alternativa a la grilla de tarjetas.
- Fundido de entrada/salida (fade in/out) al reproducir.

### Mantenimiento técnico
- Actualizar Electron y electron-builder a versiones más recientes (salto grande, requiere una ronda de pruebas dedicada).
- Evaluar firmar digitalmente la app para que Windows deje de mostrar el aviso de "Editor desconocido" (tiene costo económico).

---

## 📄 Licencia

Proyecto de uso personal.
