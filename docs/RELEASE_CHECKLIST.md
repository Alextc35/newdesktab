# Cierre técnico del producto

- [x] Confirmar persistencia en acciones masivas y demás operaciones destructivas.
  - `features/persistence/persistedAction.js` confirma la escritura antes del éxito.
  - Reintentos conservan el resultado y no repiten duplicaciones, movimientos ni borrados.
  - Aplicado a acciones masivas, papelera, borrados de elementos, carpetas y espacios, y deshacer/rehacer.
  - Aviso persistente con reintento accesible dentro o fuera de los diálogos.
  - Diez escenarios de fallo de escritura masivo/destructivo comprueban el resultado después de recargar.
- [x] Dividir `platform/storage/storageFacade.js`.
  - Extraídos `storageIO`, `storageCoordination`, `storageUsage` y `concurrentPlacement`.
  - Fachada pública y esquema conservados; cuotas, migraciones y mezcla entre pestañas verificados.
- [x] Dividir `features/settings/themeSection.js`.
  - Extraídos `wallpaperLibrary`, `wallpaperFiles` y `wallpaperPreview`.
  - Verificados cancelación, limpieza de archivos, rotación, vídeo y estado por dispositivo.
  - Cancelar tras un reintento global conserva los archivos que ya utiliza el estado guardado.
- [x] Medir backups con vídeos grandes.
  - Medidos exportación y restauración reales con vídeos sintéticos de 10, 50 y 200 MiB.
  - Registrados tiempos, expansión del JSON y muestras de memoria JS en perfiles persistentes.
  - [Datos, metodología y decisión de formato](benchmarks/BACKUP_MEDIA.md).
  - ZIP binario aplicado cuando hay vídeos locales; JSON conservado sin vídeos y en importaciones antiguas.
  - Verificados 200 MiB y dos vídeos de 200 MiB, con muestras de memoria JS cercanas a 80 MiB.
- [x] Separar responsabilidades de `features/grid/gridPointerController.js`.
  - Extraídos `gridDragSession`, `gridResizeGesture`, `gridPointerGeometry` y `gridGestureState`.
  - Conservados los algoritmos de colocación y animación.
  - Verificados selección, carpetas, papelera, widgets, movimiento, resize y cambios de tamaño de ventana.

Validación del 10 de octubre de 2026: ESLint correcto, 222 tests unitarios
y 57 tests DOM correctos; 191 escenarios de navegador correctos.
La extensión empaquetada y extraída también pasa la prueba real en Chromium,
incluida la restauración del backup ZIP con vídeo después de borrar los datos locales.

La validación anterior se conserva como historial del cierre de arquitectura.
El estado del lanzamiento 1.0.0 y de su ZIP está en [RELEASE_REVIEW.md](RELEASE_REVIEW.md).

## Lanzamiento 1.0.0 — 12 de octubre de 2026

- [x] Limpiar referencias de imágenes locales ausentes en importación/exportación
  y en las selecciones de este dispositivo, conservando archivos incluidos,
  URLs alternativas y datos compartidos. Verificados 32 escenarios relacionados,
  16 de imágenes/backups en Chrome 123 y el ZIP en cuatro navegadores.

- [x] Añadir historial local a los editores, atajos, botones SVG discretos y
  flash al deshacer/rehacer; conservar texto, imágenes y contraste. Verificar
  79 escenarios relacionados, repetir los 22 del editor final y comprobar
  26 escenarios de editores/concurrencia en Chrome 123 y el ZIP en cuatro navegadores.

- [x] Separar Ayuda de Información, con icono de libro y cuatro idiomas; verificar
  83 escenarios relacionados y el ZIP actualizado en cuatro navegadores.

- [x] Añadir el aviso único de cada versión y su historial en Información, con
  nota personal 1.0.0 y cuatro idiomas. Llegada: notas, guía y consejo con su SVG;
  consejos abajo a la derecha y avisos ocultos con flash en modo lista.

- [x] Iniciar el esquema público en 1 y descartar los esquemas 2–21 de desarrollo.

- [x] Rechazar backups malformados antes de restaurar medios o reemplazar datos.
- [x] Rechazar esquemas futuros en backups completos y exportaciones de favoritos.
- [x] Rechazar IDs duplicados, conservando archivos antiguos válidos y relaciones con carpetas.
- [x] Mantener definitivo el borrado confirmado del reloj, también al reintentar el guardado.
- [x] Actualizar la prueba de rótulos para comprobar sus colores guardados y su contraste.
- [x] Corregir la preparación de la prueba de redimensionado y el navegador de las pruebas de concurrencia.
- [x] Sincronizar manifest, package, package-lock y README en 1.0.0.
- [x] Declarar Chrome 123 como versión mínima y corregir los atajos documentados.
- [x] Añadir notas de lanzamiento y regenerar/revisar las cuatro imágenes de la Store.
- [x] Ejecutar lint, 271 pruebas unitarias y 69 pruebas DOM sin errores.
- [x] Resolver favicons ausentes mediante dominios padre, sin modificar enlaces;
  verificar 35 escenarios relacionados, 5 en Chrome 123 y SharePoint con el servicio real.
- [x] Confirmar la batería completa con esquema 1 y notas de versión: 268 escenarios correctos en Chromium, sin fallos ni reintentos.
- [x] Verificar con esquema 1 los 23 escenarios de backups y fondos en Chrome 123; su batería completa anterior al reinicio pasó los 252 escenarios.
- [x] Verificar los 37 escenarios de notas, bienvenida, ayuda y concurrencia en Chrome 123.
- [x] Generar y verificar el ZIP 1.0.0; probar el contenido extraído en Chromium, Google Chrome, Brave y Chrome 123.
- [x] Confirmar Chrome Sync entre perfiles/dispositivos reales: verificado por el autor en esta conversación.
- [x] Confirmar que los enlaces públicos de privacidad y soporte responden correctamente.

Después de subir los commits, comprobar el resultado de GitHub Actions. Antes
del envío a la Store, comprobar en su panel la identidad del paquete, las
declaraciones de privacidad, contacto y verificación en dos pasos. Estos pasos
administrativos no se han dado por realizados durante la validación local.
