# Informe final de auditoría — New DeskTab 1.0.0

Finalizada el 14 de octubre de 2026 en Windows.

La validación automatizada termina en verde: **283 unitarios, 76 tests de DOM y
338 E2E**, con lint correcto. La suite completa se ejecutó con un worker, sin
reintentos ni casos omitidos. El ZIP se verificó byte a byte y se probó como
extensión real en Chromium, Google Chrome y Brave, con perfiles nuevos.

## Rendimiento medido y mejoras

La apertura de la papelera era el cuello de botella principal. Cada fila hacía
una copia de toda la biblioteca para consultar la retención y creaba otro
formateador de fecha. Ahora se lee una sola instantánea para construir la lista,
se comparte la retención entre sus filas y se reutiliza el formateador por idioma.
El recorrido de apertura hace dos copias aisladas en total — comprobación de
caducidad y render — en lugar de una por fila.

Con 1.200 favoritos más 18 dentro de una carpeta y 60 elementos en papelera,
la mediana de apertura pasa de **987.45 a 49.60 ms (95.0% menos)**
con CPU limitada a 4×. Las carpetas y la papelera conservan sus nodos, selección
y foco ante cambios de UI que no afectan a sus datos. Las pruebas comprueban
este comportamiento y evitan que vuelva la copia por fila.

### Benchmark controlado

Chromium 151.0.7922.34, Windows, 1440 × 900, medios externos bloqueados,
Debug activo, dos calentamientos y seis muestras por interacción. Ambos perfiles
tienen 60 favoritos visibles, una carpeta con 18 favoritos y una papelera con
60 elementos; la biblioteca base tiene 60 o 1.200 favoritos.

Medianas de **JavaScript síncrono**, en milisegundos. La respuesta hasta dos
cuadros está separada en los JSON del benchmark; no es el tiempo de propagación
de Sync ni la duración de una descarga.

| Acción | Biblioteca 60, CPU 4× | Biblioteca 1.200, CPU 4× | Biblioteca 1.200, CPU normal |
| --- | ---: | ---: | ---: |
| Abrir ajustes | 10.80 | 10.65 | 1.55 |
| Abrir editor de favorito | 32.35 | 45.30 | 7.35 |
| Editar nombre | 9.75 | 5.95 | 1.40 |
| Reconstruir grilla | 27.55 | 42.00 | 7.05 |
| Redimensionar grilla | 4.30 | 19.10 | 3.10 |
| Abrir carpeta con 18 favoritos | 67.25 | 97.85 | 17.70 |
| Abrir editor de carpeta | 15.30 | 31.00 | 7.45 |
| Abrir papelera con 60 elementos | 27.85 | 49.60 | 10.30 |
| Abrir editor de papelera | 13.90 | 28.50 | 5.35 |
| Abrir búsqueda | 7.25 | 17.20 | 4.15 |
| Filtrar búsqueda | 4.15 | 17.60 | 2.85 |
| Abrir catálogo de widgets | 3.10 | 3.05 | 0.60 |
| Abrir creación del reloj | 4.25 | 4.30 | 0.85 |

Solo se atribuye una mejora porcentual al cuello de botella corregido. Las
variaciones pequeñas del resto de acciones no se presentan como optimizaciones.

### Tiempos durante todos los recorridos E2E

Se recogieron **2707 registros de Debug**, agrupados en
70 operaciones/contextos, y **8051 respuestas visuales**
de 614 controles/tipos de evento. Los comandos de
persistencia incluyen preparación, cola, escritura y notificación; la preparación
genérica de un modal se mide separadamente del editor completo.

| Operación | Muestras correctas | Mediana ms | P95 ms |
| --- | ---: | ---: | ---: |
| Create bookmark | 67 | 12 | 30.1 |
| Create folder | 77 | 12.7 | 24.5 |
| Delete bookmarks | 32 | 12.8 | 52.3 |
| Edit bookmark | 22 | 20.05 | 46.2 |
| Open bookmark editor | 88 | 6 | 9.6 |
| Open settings | 132 | 3.8 | 5 |
| Prepare grid drag | 71 | 0.4 | 0.8 |
| Render grid | 487 | 3.4 | 9.3 |
| Save daily tips preference | 4 | 18.65 | 31.6 |
| Save settings | 95 | 26.3 | 61.9 |
| Search bookmarks | 4 | 0.2 | 0.4 |
| Switch workspace | 6 | 4.05 | 5.8 |

Los E2E usan diferentes bibliotecas e incluyen fallos, retardos y relojes simulados.
Estos percentiles describen los recorridos de prueba. La comparación de velocidad
se apoya en el benchmark controlado. Los registros de error de Debug aparecen
en pruebas que comprueban fallos y recuperación, y se cuentan separadamente del
resultado E2E.

### Backups: duración asíncrona completa

Se ejecutaron las acciones reales de exportación e importación con un perfil
persistente de Chromium nuevo para cada tamaño, a velocidad normal de CPU.
Los vídeos tienen bytes sintéticos con MIME WebM. La restauración verifica el
tamaño de cada archivo, sus bytes iniciales/finales y la disponibilidad de su
URL local en IndexedDB. Se mide la generación del Blob y la restauración; la
descarga a disco y la reproducción del vídeo quedan fuera.

Una ejecución por escenario; no son medianas ni límites garantizados.

| Vídeos | Exportación ms | Importación ms | ZIP MiB |
| --- | ---: | ---: | ---: |
| 1 × 10 MiB | 69.60 | 72.40 | 10.00 |
| 1 × 50 MiB | 250.10 | 263.60 | 50.00 |
| 1 × 200 MiB | 804.90 | 1064.40 | 200.00 |
| 2 × 200 MiB | 1538.50 | 2946.80 | 400.00 |

## Cobertura y limpieza

- **199 módulos JS y 47 hojas CSS** conectados a sus
  entradas. No se detectan módulos huérfanos ni clases o exportaciones pendientes
  de justificación en el análisis estático.
- Se eliminaron **12 funciones o constantes antiguas**. Duplicar, mover y eliminar
  se prueban ahora mediante las acciones que utiliza la interfaz, compartidas por
  favoritos, carpetas y widgets.
- Las ocho clases CSS generadas dinámicamente tienen referencias verificadas.
  Se retiraron las reglas, controles y traducciones que ocultaban la silueta de
  las carpetas, comportamiento que ya no se ofrece.
- Se conservaron el registro público de widgets y el exportador compatible con
  backups JSON de vídeos antiguos, con sus pruebas. La cobertura no se utiliza
  por sí sola para borrar APIs, rutas de error o reglas de accesibilidad.
- En las páginas principales de los E2E se observaron
  **82.42% de funciones V8** y
  **90.64% del texto CSS cubierto**.
  No son porcentajes de líneas o ramas ni una garantía sobre estados no recorridos.
  Al excluir las dependencias vendorizadas, el porcentaje de funciones V8
  observadas es **90.84%**
  en los módulos propios cargados por esas páginas. Gran parte de las funciones
  restantes del total pertenece a opciones de la librería ZIP; no se borran por
  no aparecer en un recorrido.
- La ejecución adicional de cobertura unitaria registra, en los
  **77 módulos de fuente cargados por Node**, un
  **91.45% de líneas**, un
  **76.39% de ramas** y un
  **74.54% de funciones**. Esta métrica excluye
  DOM/E2E y módulos no cargados; no se suma a la cobertura de Chromium ni se
  presenta como cobertura completa de la aplicación.
- `npm audit`: **cero vulnerabilidades conocidas** en dependencias de producción
  y desarrollo.

Se revisaron crear/editar, presets, imágenes locales y remotas, color e inversión,
historial, selección simple y múltiple, arrastre y resize con todos sus modos,
tiradores y zonas de papelera, carpetas y su contenido, restauración y eliminación,
espacios de trabajo, reloj, búsquedas, ajustes, idiomas, atajos, Sync y errores,
backups JSON/ZIP, popup, concurrencia, guía, manual y consejos diarios.

### Inventario E2E

La suite completa incluye los tres nuevos recorridos de capacidad.

| Archivo de recorridos | Casos correctos |
| --- | ---: |
| backupMedia.spec.js | 10 |
| behaviorPreviews.spec.js | 8 |
| bookmarkIconColor.spec.js | 2 |
| bookmarkJourneys.spec.js | 68 |
| bulkPersistence.spec.js | 10 |
| capacityLimits.spec.js | 3 |
| clockWidget.spec.js | 8 |
| compactView.spec.js | 22 |
| concurrentTabs.spec.js | 4 |
| dailyTipsSettings.spec.js | 3 |
| debug.spec.js | 5 |
| defaultWallpaper.spec.js | 7 |
| deviceImageSelections.spec.js | 1 |
| deviceTrash.spec.js | 1 |
| editorHistory.spec.js | 14 |
| favicon.spec.js | 5 |
| folderAppearance.spec.js | 14 |
| gridDropPrecision.spec.js | 7 |
| help.spec.js | 8 |
| interfacePreferences.spec.js | 11 |
| inversionControls.spec.js | 1 |
| itemAppearanceEditor.spec.js | 31 |
| keyboardShortcuts.spec.js | 5 |
| listArtwork.spec.js | 2 |
| localImageFallback.spec.js | 2 |
| manualDemos.spec.js | 10 |
| missingLocalImages.spec.js | 6 |
| onboarding.spec.js | 11 |
| recycleBin.spec.js | 8 |
| releaseNotes.spec.js | 14 |
| saveFailures.spec.js | 11 |
| settingsGeneral.spec.js | 2 |
| syncSettings.spec.js | 7 |
| themeWallpapers.spec.js | 13 |
| uiPerformance.spec.js | 4 |

## Correcciones de interfaz verificadas y commits separados

- `769b828` — SVGs de la lista y miniaturas conservan el color guardado.
- `1f38afb` — color independiente del SVG, debajo del selector; oculto para el
  logo oficial. Se conserva al alternar iconos, admite deshacer/rehacer y se guarda.
- `48350fd` — silueta de carpeta siempre visible; «Ninguno» vacía el símbolo
  interior. Los controles de inversión se ocultan cuando no tienen contenido.
- `61f94fd` — consejos diarios requieren Guardar; Cancelar descarta el cambio.
  Un fallo de escritura conserva el borrador y permite reintentar.

La suite detectó una interrupción del foco al finalizar la animación del selector
de iconos. Se corrigió para respetar una elección de teclado o un foco posterior,
con una prueba que controla la animación y reproduce esa condición.

También se corrigió un desplazamiento horizontal de 2,27 px en carpetas sin
nombre dentro de celdas estrechas: los márgenes automáticos impedían centrar
el SVG cuando superaba el ancho interior. La prueba espera la nueva anchura
de la celda y comprueba un desfase menor de 0,5 px en tarjetas y previews.

La revisión de cobertura añadió dos recorridos para el botón real de borrar
todos los datos en Ajustes. Comprueban cancelar sin cambios, confirmar el borrado
de favoritos, carpetas, widgets, papelera y archivos locales, persistencia tras
recarga, conservación de los datos remotos y reintento tras un fallo de escritura.

### Límites de espacio y avisos

- La grilla tiene 12 × 6 celdas. En una grilla completamente ocupada se
  probaron arrastres hacia los cuatro límites exteriores e intentos de ampliar
  el item de la última celda: posiciones y tamaños guardados permanecen dentro
  de los límites. Restaurar sin hueco conserva el item en papelera y avisa.
- Una carpeta con 17 favoritos acepta el número 18 con su flash de éxito.
  El intento de añadir el número 19 muestra «This folder already has 18 bookmarks»
  y conserva el favorito en su posición; la carpeta mantiene 18 tras recargar.
  Los backups antiguos con desbordamiento conservan su contenido accesible;
  no se elimina contenido previo para imponer el límite de nuevas altas.
- La papelera no tiene límite de 18 ni de 72 entradas. Se comprobó una lista
  inicial de 250 entradas que recibe otro favorito y una carpeta con sus 18
  favoritos: conserva 252 entradas, el contenido de la carpeta y los flashes
  de éxito, tras recarga. Los fallos de persistencia tienen aviso flash y
  reintento; no se presentan como una eliminación completada.

El caso de restauración con grilla llena descubrió y corrigió un falso error
de persistencia: una operación sin cambios sobre datos ya cargados no necesita
una escritura. El comando puede aceptar el estado `idle` después de hidratar;
los guardados normales siguen exigiendo `saved`, y los errores siguen rechazándose
incluso cuando se permite un comando sin cambios. Lo comprueban una regresión
unitaria, la prueba de grilla llena y los recorridos de fallos/reintentos.

## Artefacto validado

- Archivo: `dist/newdesktab-1.0.0.zip`.
- Contenido: **291 archivos**, **2,514,068 bytes**.
- SHA-256: `e9172d4298365fbbaced16fbaebad1bbdd20c0c9420e6aeafbfe63f43b49a995`.
- La extracción se comprobó contra los archivos actuales del proyecto.
- Smoke real: nueva pestaña, guardado en popup, recarga, atajos y backup ZIP
  con vídeo en los tres navegadores. Chrome instalado: 155.0.8059.40;
  Brave instalado: 155.1.97.56.

## Evidencia y alcance

Los resultados completos están en `dist/release-audit/`: `final-check.log`,
`final-unit-coverage.log`, `final-unit-coverage.lcov`, `final-capacity.log`,
`final-e2e.log`, `final-actions-summary.json`, `final-actions-summary.md`,
`final-actions-summary-ui-responses.csv`, `final-cleanup-source-after.json`,
`final-ui-before.json`, `final-ui-final.json`, `final-ui-normal.json`,
`final-backup-performance.json`, `final-backup-multiple.json`,
`final-npm-audit.json`, `final-package.json` y `final-extension-*.log`.
Los registros de la suite completa están en `final-actions-v7/`. La evidencia resumida
también se conserva en [RELEASE_1_0_0_RESULTS.json](RELEASE_1_0_0_RESULTS.json).

El procedimiento para repetirlo está en [ACTION_AUDIT.md](ACTION_AUDIT.md).
Las pruebas son de Windows/Chromium y navegadores instalados con perfiles
aislados. No se ha medido un Mac físico ni la propagación real de Sync entre
dispositivos. Una release con pruebas verdes no equivale a una garantía de
ausencia de errores en cualquier combinación de equipo, datos y red.
