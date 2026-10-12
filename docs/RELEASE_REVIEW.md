# Revisión de preparación para publicar — 1.0.0

Revisión de cierre del 12 de octubre de 2026. Este informe distingue la validación
automatizada de las comprobaciones que necesitan perfiles y cuentas reales.
Chrome Sync entre perfiles o dispositivos reales está verificado por el autor,
según su confirmación en esta conversación. El primer esquema público es 1;
los esquemas 2–21 de desarrollo se han descartado por decisión del autor.

## Cambios aplicados

- **Favicons.** Si faltan, se prueban los dominios padre hasta el dominio
  registrable, sin cambiar la URL guardada. Se conservan los iconos válidos de
  subdominios y los límites de sufijos como `.co.uk`. Las respuestas HTTP se
  comprueban con HEAD sin cookies y caché por origen para detectar el globo
  genérico de Google con estado 404. El permiso nuevo se limita a `t3.gstatic.com`.

- **Ayuda.** Sección propia en ajustes con icono de libro, buscador del manual,
  respuestas habituales, guía rápida y preferencia de consejos diarios. Los
  cuatro idiomas y el propio manual apuntan a Ayuda. Información conserva la
  presentación del proyecto, la versión y las notas de actualización.

- **Notas de versión.** Aviso único por versión y perfil antes de la guía inicial,
  historial consultable desde Información y traducciones en los cuatro idiomas.
  La nota 1.0.0 recoge la historia y el agradecimiento del autor y aclara que el
  reloj sigue en desarrollo. El consejo diario aparece después de cerrar las
  notas y la guía, siempre abajo a la derecha, con temporizador y pausas por
  interacción. En modo lista se ocultan los paneles de ayuda con un flash y los
  avisos pendientes esperan una ventana más amplia. Web Locks protege la reclamación entre
  pestañas; el marcador queda fuera de Sync y backups. El lector conserva los
  ajustes pendientes, el foco y la posición inicial de lectura al reabrirlo.

- **Esquema público inicial.** Los perfiles nuevos, datos persistidos y backups
  empiezan con `schemaVersion: 1`. No se migran los esquemas de desarrollo 2–21.
  Las pruebas de normalización usan datos sin versión; la protección ante
  esquemas superiores sigue activa, incluido el antiguo 21.

- **Importación sin pérdida por archivos inválidos.** Se comprueba la estructura
  de los backups antes de que la migración pueda convertir datos malformados en
  un espacio vacío. Se rechazan versiones futuras exteriores e interiores e IDs
  duplicados, incluidos conflictos entre favoritos, carpetas y widgets. Los
  archivos antiguos válidos y las relaciones con carpetas se conservan. Las
  nuevas pruebas verifican que un rechazo no cambia almacenamiento ni medios
  y que los datos siguen intactos después de recargar.
- **Borrado definitivo del reloj.** El editor elimina el reloj sin conservar una
  operación que permita resucitarlo al deshacer. Su recorrido y el reintento tras
  un error de escritura se verificaron tres veces consecutivas en Chrome 123.
- **Pruebas actuales y portables.** El escenario de carpetas verifica colores
  guardados y contraste de sus rótulos en ambos temas. La prueba de redimensionado
  espera el guardado mediante el estado, sin retener una evaluación de Playwright
  a través de Web Locks. Las pruebas de concurrencia respetan el navegador
  seleccionado y usan el modo headless compatible con Chrome 123. El smoke test
  puede cargar la extensión mediante DevTools en Google Chrome instalado.
- **Versión y ficha.** Manifest, package, package-lock y README indican 1.0.0.
  Se declara Chrome 123 como mínimo, se documentan los atajos E/B/F/W/S y se
  incluyen las notas de lanzamiento. Se regeneraron las cuatro imágenes de la
  Store y se inspeccionaron visualmente, incluida la versión 1.0.0 en Información.

- **Recuperación de escrituras fallidas.** El store conserva la base de los
  cambios pendientes hasta que se guardan. Una actualización de otra pestaña
  ya no borra esos cambios; el siguiente intento los combina con los datos
  persistidos. Hay pruebas de fallos consecutivos y actualización remota.
- **Confirmación de guardado.** Los editores de favoritos, carpetas, papelera
  y reloj, los ajustes y las importaciones esperan la confirmación de
  persistencia antes de anunciar éxito. Los editores conservan el formulario
  abierto ante un fallo. Crear de nuevo tras ese fallo reutiliza el mismo
  elemento; el guardado rápido y la eliminación del reloj también permiten
  reintentar sin duplicar ni recrear elementos.
- **Acciones masivas y destructivas.** Un controlador común conserva el resultado
  del comando y anuncia éxito tras confirmar la escritura. Cubre duplicación,
  estilos, movimientos, borrados, restauraciones, espacios y deshacer/rehacer.
  Un aviso persistente permite reintentar sin ejecutar de nuevo la mutación;
  también recoge fallos de cambios directos de la cuadrícula. El aviso sigue
  al diálogo activo para conservar el acceso con teclado.
- **Separación de responsabilidades.** Almacenamiento, ajustes de fondos y
  gestos de cuadrícula componen módulos con responsabilidades concretas.
  Se conserva la API de almacenamiento, el esquema y los algoritmos de colocación.
- **Propiedad del editor visual.** El editor de apariencia y su CSS viven en
  `src/features/item-editor/`. `shared/ui` queda reservado para controles
  reutilizables sin conocimiento de favoritos, carpetas ni papeleras.
  Las pruebas de arquitectura protegen esta separación y la independencia
  del dominio respecto de la interfaz y de las APIs del navegador.
- **Herramientas portables.** Playwright y el generador de imágenes para la
  Store comparten un servidor Node limitado a loopback, con validación de
  rutas, sin listado de directorios y sin caché. Las pruebas de navegador
  dejan de depender del nombre del intérprete Python de cada sistema.
- **Dependencias.** Se actualizaron las dependencias de desarrollo vulnerables
  mediante versiones compatibles y se incorporó la auditoría a CI.
- **Interfaz y regresiones.** Se corrigió el desplazamiento de los ajustes al
  suspenderlos y cambiar el tamaño de ventana. Las pruebas antiguas se
  adaptaron a la interfaz actual y esperan los elementos antes de medirlos.
  La restauración de foco al cerrar un diálogo respeta un campo que el usuario
  haya enfocado después; la navegación excluye controles dentro de bloques
  ocultos. Cancelar ajustes después de recuperar una escritura fallida conserva
  los archivos locales que ya utiliza el estado guardado.
- **Backups y privacidad.** Se verificó el ciclo de exportación, borrado,
  importación y recarga con imagen y vídeo locales. La documentación refleja
  que los backups completos incluyen esos archivos y describe `activeTab`.
  Se midieron exportación y restauración con archivos sintéticos de 10, 50 y
  200 MiB y con dos vídeos de 200 MiB. Con vídeos locales se exporta un ZIP
  binario por partes; sin ellos se conserva JSON. También se siguen importando
  los JSON antiguos con vídeos base64. El ZIP se valida antes de restaurar datos.
- **Material de publicación.** Se regeneraron las imágenes de la Store y se
  revisaron visualmente. Se preparó el ZIP y se probó su contenido extraído
  como extensión real en un perfil nuevo de Chromium.

## Validación

| Comprobación | Resultado |
| --- | --- |
| ESLint, tests unitarios y DOM | 261 tests unitarios y 66 tests DOM correctos; ESLint correcto. |
| `npm run test:e2e` | Antes de separar Ayuda: 268 escenarios correctos en Chromium, 12,1 minutos; sin fallos, omitidos ni reintentos. |
| Sección Ayuda | 83 escenarios verificados de ayuda, guía, demos, navegación, fondos, notas y modo lista. Se corrigió un acceso antiguo a Información en un test y los 7 escenarios de fondos pasaron al repetirlos. Layout revisado a 601, 720 y 1280 píxeles; traducciones correctas en cuatro idiomas. |
| Fallback de favicons | 35 escenarios correctos de favicons, editor visual, carpetas y papelera en Chromium; 5 de favicons en Chrome 123. Además se verificó el servicio real de Google con el ZIP instalado en Chrome 123, Chrome 155 y Brave 155: SharePoint funciona y la URL original se conserva en la tarjeta y el editor. |
| Chrome for Testing 123.0.6312.122 | Antes de separar Ayuda: 37 escenarios de notas, ayuda, bienvenida y concurrencia correctos; incluyen llegada secuencial, modo lista, posición e iconos del consejo diario. Smoke del ZIP actual con Ayuda correcto. Validación anterior con esquema 1: 23 escenarios de backups y fondos. Batería completa previa al reinicio: 252 escenarios correctos. |
| Validación ZIP | 13 pruebas de formato y entradas inválidas; cuatro recorridos de navegador correctos, incluida compatibilidad JSON, selector ZIP y rechazo de vídeos dañados. Un lector ZIP independiente de Python también verifica el archivo descargado. |
| `node scripts/benchmark-backups.mjs` | ZIP exportado/restaurado con 10, 50, 200 MiB y dos vídeos de 200 MiB; tamaños, tiempos y muestras de memoria registrados. |
| `npm audit --audit-level=high` | Cero vulnerabilidades tras la actualización de herramientas de desarrollo. |
| `npm run assets:store` | Generación correcta; cuatro imágenes inspeccionadas. |
| `npm run test:extension` | ZIP extraído correcto en Chromium, Google Chrome 155.0.8059.40, Brave 155.1.97.56 y Chrome for Testing 123.0.6312.122: nueva pestaña, Ayuda → manual → ajustes, Información, popup, recarga, atajos y backup ZIP con vídeo bajo Manifest V3; sin errores de página. |
| Chrome Sync real | Verificado por el autor entre perfiles/dispositivos; no se sustituye por la simulación de storage de los tests. |
| Enlaces de la ficha | Privacidad y soporte públicos responden HTTP 200. |
| `git diff --check` | Sin errores de espacios o conflictos. |

Artefacto: `dist/newdesktab-1.0.0.zip`, 2.479.193 bytes y 277 archivos.
Incluye únicamente recursos de la extensión, licencia y política de privacidad.
El empaquetador comprueba cada entrada y su contenido contra el origen.

SHA-256:

```text
90f6dcd0c729a2bf5aa40566712c281f189ccfb5cbaff657d22abfbea44e4c8a
```

Las mediciones de vídeos grandes y las pruebas de rendimiento descritas en este
informe proceden del cierre del 10 de octubre; sus resultados detallados se
conservan en `docs/benchmarks/`. La comprobación del paquete 1.0.0 se ejecutó
nuevamente el 12 de octubre con perfiles temporales nuevos. Los smoke tests
generales bloquean las solicitudes externas para no depender de proveedores de
imágenes. La comprobación específica de SharePoint permite solo el servicio de
favicons de Google para verificar el fallback y su permiso real.

El procedimiento reproducible de publicación está en
[CHROME_WEB_STORE.md](CHROME_WEB_STORE.md). En este Windows se utilizó Python
3 directamente para empaquetar, porque el alias `python3` no está disponible.

## Mejoras de arquitectura aplicadas

La [checklist](RELEASE_CHECKLIST.md) recoge los cinco puntos solicitados y sus
criterios de cierre. Las responsabilidades quedan distribuidas así:

- `features/persistence/persistedAction.js`: confirmación y reintento de comandos.
- Almacenamiento: `storageIO`, `storageCoordination`, `storageUsage` y
  `concurrentPlacement`; la fachada conserva su contrato.
- Fondos: `wallpaperLibrary`, `wallpaperFiles` y `wallpaperPreview`; el editor
  principal conserva la coordinación del borrador.
- Cuadrícula: `gridDragSession`, `gridResizeGesture`, `gridPointerGeometry` y
  `gridGestureState`; la geometría y la planificación dejan de mezclarse con
  los comandos de arrastrar y soltar.

La [medición de backups](benchmarks/BACKUP_MEDIA.md) compara el JSON anterior con
el ZIP aplicado. Un vídeo de 200 MiB pasa de un backup de 266,67 a 200,00 MiB;
la mayor muestra de memoria JS baja de 1.070,9 a 79,5 MiB. Dos vídeos de 200 MiB
también se restauran correctamente, con una muestra de 80,0 MiB. Se verifica
almacenamiento y transporte, no reproducción ni toda la RAM del proceso.
La frecuencia de muestreo difiere entre las mediciones; no se garantiza capturar
el máximo absoluto ni se valida toda biblioteca o sesión de incógnito posible.

## Pasos pendientes de publicación

1. Guardar y subir los cambios del fallback de favicons y comprobar GitHub Actions
   para el commit definitivo. El commit `176ccfe` ya tiene una
   [ejecución remota correcta](https://github.com/Alextc35/newdesktab/actions/runs/38236420523);
   esa ejecución no cubre los cambios posteriores. Las notas de versión están
   en `12760ea` y Ayuda en `c0ca046`; el fallback de favicons todavía no tiene commit.
2. Comprobar que la clave del manifiesto corresponde a la ficha, y revisar
   descripción, privacidad, correo de contacto y verificación en dos pasos.
   Las imágenes ya se regeneraron e inspeccionaron en esta revisión; repetir
   ese paso si cambia la interfaz antes del envío.
3. Cargar el ZIP y las imágenes, completar las declaraciones y enviar a revisión.

Chrome Sync real y la instalación del ZIP en Chrome y Brave quedan verificados.
La publicación en la Store queda pendiente de los pasos administrativos anteriores.
