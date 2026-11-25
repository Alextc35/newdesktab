# New DeskTab — Your browser. Your space.

Proyecto audiovisual editable de lanzamiento de **New DeskTab 1.0.0**. La superficie del producto procede de la extensión real instalada en Chromium: no se ha reconstruido su interfaz. Los favoritos son datos de demostración que enlazan a sitios reales. La instalación original comienza con un escritorio vacío.

Las capturas y los vídeos conservan la versión 1.0.0 que muestran. La extensión
actual es 1.1.2 e incorpora importación de Chrome/HTML y carpetas anidadas;
consulta el [changelog](../CHANGELOG.md). Volver a ejecutar la captura utiliza el
checkout actual y requiere revisar el montaje y sus textos antes de publicarlo.

## Entregas

| Archivo | Formato |
| --- | --- |
| `output/newdesktab-promo-1080p.mp4` | 56 segundos · 1920 × 1080 · 60 FPS · H.264 / AAC estéreo |
| `output/newdesktab-promo-vertical.mp4` | 26 segundos · 1080 × 1920 · 60 FPS · H.264 / AAC estéreo |
| `output/newdesktab-promo-editable.zip` | Código, configuración, capturas, clips y audio necesarios para editar y volver a renderizar |
| `output/newdesktab-promo-poster.jpg` | Fotograma de portada del vídeo principal |
| `output/contact-sheet-landscape.jpg` / `contact-sheet-vertical.jpg` | Contactos visuales de los vídeos exportados |
| `output/validation-report.json` | Metadatos, decodificación completa y mediciones de audio de ambas exportaciones |

Los MP4 finales se entregan por separado del ZIP editable para evitar duplicar archivos grandes. Toda la carpeta generada `output/` se excluye del seguimiento de Git; los medios de origen necesarios para volver a renderizar sí se incluyen en `public/`. La carpeta `output/preview/` conserva la versión preliminar de revisión a 960 × 540 / 30 FPS.

## Dirección creativa

Concepto: una nueva pestaña se convierte en tu propio espacio. Fondo azul oscuro, acentos cian tomados del logotipo oficial, tipografía editorial Manrope, ventanas con profundidad, transiciones de 24 fotogramas y acciones reales. Los textos del vídeo están en inglés. Sin voz en off.

| Tiempo principal | Contenido |
| --- | --- |
| 00–05 | “Your new tab. Reimagined.” · transformación del escritorio vacío |
| 05–13 | Descubrimiento del escritorio y favoritos visuales |
| 13–17,5 | Arrastre real de una tarjeta |
| 17,5–21,5 | Redimensionamiento real |
| 21,5–25 | Editor de estilo y previsualización |
| 25–31 | Apertura de carpeta y sus enlaces |
| 31–38 | My space → Focus → Personal |
| 38–42 | Búsqueda de favoritos entre espacios |
| 42–50 | Plano general del producto |
| 50–56 | Marca, eslogan y llamada a la acción |

La versión vertical tiene una secuencia y composición propias: presentación, personalización, carpeta, espacios y cierre. No es un recorte del MP4 horizontal. Sus vistas del producto se encuadran para el lienzo móvil y su banda sonora tiene un cierre propio.

## Instalar y visualizar

Requisitos: Node.js 24, npm, FFmpeg y FFprobe en el PATH. Remotion/React/TypeScript/Playwright están fijados en `package-lock.json`.

```powershell
cd promo-video
npm ci
npx playwright install chromium
npm run studio
```

En Remotion Studio, elegir `NewDeskTabPromo` o `NewDeskTabVertical`. Las capturas y el audio necesarios están incluidos; no hace falta volver a capturar la extensión para cambiar títulos, colores o tiempos.

El renderizador detecta Chromium instalado por Playwright. Para utilizar otro ejecutable:

```powershell
$env:NEWDESKTAB_BROWSER_PATH = 'C:\ruta\chromium\chrome.exe'
npm run render
```

Si no encuentra un navegador, Remotion puede descargar su navegador compatible. Las capturas requieren Chromium con soporte para cargar extensiones desempaquetadas; Chrome for Testing / Chromium de Playwright es la opción comprobada.

## Editar

- **Textos, colores, versión, URL, tiempos y orden:** `src/config.ts`.
- **Velocidad y duración de los clips:** `CLIPS` en `src/config.ts`. Se conserva el último fotograma útil al terminar cada clip.
- **Entrada de texto y curvas de movimiento:** `src/animations/motion.ts`.
- **Marca, tipografía, fondos y componentes:** `src/components/Design.tsx`.
- **Marco y cámara del producto:** `src/components/ProductWindow.tsx`.
- **Planos y composición móvil:** `src/scenes/`.
- **Secuenciación y mezcla de sonido:** `src/compositions/Promo.tsx`.
- **Pistas, clics y tiempos de audio:** `src/audio-timeline.json`, utilizado tanto por Studio como por la mezcla final.
- **Dimensiones / duración total:** `src/Root.tsx`. Al cambiar la duración total, actualizar también el generador musical y las especificaciones de `scripts/validate.mjs`.

Las fuentes y los medios se cargan desde `public/`, sin depender de redes externas durante el renderizado. La tipografía propia de la extensión se conserva dentro de las capturas. El marco de navegador es un elemento de presentación; la superficie interior completa procede del producto.

## Renderizar y validar

```powershell
npm run typecheck
npm run preview
npm run stills
node scripts/render.mjs --vertical --stills
npm run render
npm run render:vertical
npm run validate
npm run package:editable
```

El render principal utiliza CRF 17, JPEG intermedio de calidad 95, color BT.709, formato de píxel yuv420p y audio AAC a 320 kb/s. Seis tareas de renderizado concurrentes por defecto; se puede ajustar para el equipo:

```powershell
$env:RENDER_CONCURRENCY = '6'
npm run render
```

El renderizador produce primero la imagen sin audio y después `scripts/mix-audio.mjs` mezcla los WAV originales y los efectos temporizados con FFmpeg. La imagen H.264 se copia sin recomprimir y el MP4 se prepara para reproducción progresiva con `+faststart`. Esta separación evita que las optimizaciones de fotogramas de la vista previa afecten a la duración de la música. El audio de Studio utiliza la misma configuración de pistas y clics.

Para inspeccionar otros instantes sin renderizar el vídeo completo:

```powershell
$env:QA_TIMES = '5.2,14.5,24,32,50.4'
npm run stills
Remove-Item Env:QA_TIMES
```

El validador comprueba dimensiones, duración, frecuencia de fotogramas, códec H.264, audio estéreo AAC, sincronía de inicio y duración, decodificación completa, nivel sonoro y margen frente a saturación. Extrae fotogramas de cada bloque narrativo y genera contactos y portadas. La revisión visual debe incluir los archivos de `output/qa/`; el informe técnico no sustituye una revisión del montaje.

GitHub Actions comprueba este proyecto en un trabajo independiente: instalación con `npm ci`, TypeScript, auditoría de dependencias y un fotograma real de cada formato. Los renders completos se generan con los comandos anteriores.

## Repetir las capturas reales

Este paso necesita el repositorio de New DeskTab como carpeta padre. En el ZIP autónomo, para editar el vídeo se pueden conservar las capturas incluidas; para recapturar, colocar el proyecto de nuevo en `<repositorio>/promo-video`.

```powershell
npm run capture
```

`scripts/capture.mjs` crea un perfil temporal aislado de Chromium, carga el repositorio como extensión desempaquetada, prepara favoritos de ejemplo y sube el fondo oficial mediante la API real de imágenes locales. No utiliza el perfil personal del navegador. Ejecuta acciones de ratón y teclado, espera al guardado y comprueba los resultados persistidos.

Capturas de 1920 × 1200 a partir de un viewport 1440 × 900 con DPR 4/3. Los clips proceden de la grabación real de Playwright y se convierten a H.264 / 60 FPS. La grabación de origen de Playwright es aproximadamente de 25 FPS: el archivo de entrega y las animaciones de Remotion se renderizan a 60 FPS; el movimiento capturado conserva la cadencia del origen. No se ha inventado movimiento intermedio por IA.

`output/capture-report.json` documenta la URL de la extensión, versión, acciones y comprobaciones. La grabación bruta queda en `public/captures/_raw/capture-session.webm` para remontajes avanzados; se excluye del ZIP ligero, ya que los seis clips utilizados están incluidos.

## Audio y licencias

La banda sonora es una composición instrumental original generada por síntesis: pads, arpegio, bajo y percusión discreta a 96 BPM. Sin grabaciones comerciales ni muestras externas. Incluye efectos suaves de transición y archivos separados editables.

```powershell
npm run audio
```

Procedencia y licencia en `public/audio/LICENSE.md`; parámetros y mediciones en `public/audio/audio-manifest.json`. El audio WAV de origen está a 48 kHz estéreo. `LICENSE-ASSETS.md` conserva el aviso MIT de New DeskTab y la información de Manrope/OFL. Las herramientas mantienen sus propias licencias; consultar sus condiciones para otros usos de Remotion.

Documentación de las herramientas: [renderMedia](https://www.remotion.dev/docs/renderer/render-media), [renderStill](https://www.remotion.dev/docs/renderer/render-still), [Manrope y licencia OFL](https://github.com/google/fonts/tree/main/ofl/manrope).

## Fidelidad y alcance

Se muestran funciones implementadas de la versión 1.0.0. Gmail, Notion, Figma, etc. son marcadores de ejemplo, no aplicaciones nativas ni integraciones incluidas. La búsqueda es de favoritos de New DeskTab. El reloj existe, aunque el proyecto lo documenta como una función en desarrollo. No se anuncia una tienda, un servicio o una función futura.

La llamada a la acción usa la dirección pública verificada en el propio repositorio: `https://github.com/Alextc35/newdesktab`. No se encontró una URL pública de Chrome Web Store. La investigación y las referencias de código están en `RESEARCH.md`.

No se ha modificado el código de producción de la extensión. Antes del trabajo, pasaron ESLint, 308 pruebas de Node y 85 pruebas de Vitest. El proyecto audiovisual tiene dependencias y configuración separadas.
