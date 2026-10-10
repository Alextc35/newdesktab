# Revisión de preparación para publicar — 0.27.0

Revisión local del 9 y el 10 de octubre de 2026. Este informe distingue la validación
automatizada de las comprobaciones que necesitan perfiles y cuentas reales.

## Cambios aplicados

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
| ESLint, tests unitarios y DOM | 222 tests unitarios y 57 tests DOM correctos; ESLint correcto. |
| `npm run test:e2e` | 191 escenarios correctos en 7,9 minutos. |
| Validación ZIP | 13 pruebas de formato y entradas inválidas; cuatro recorridos de navegador correctos, incluida compatibilidad JSON, selector ZIP y rechazo de vídeos dañados. Un lector ZIP independiente de Python también verifica el archivo descargado. |
| `node scripts/benchmark-backups.mjs` | ZIP exportado/restaurado con 10, 50, 200 MiB y dos vídeos de 200 MiB; tamaños, tiempos y muestras de memoria registrados. |
| `npm audit --audit-level=high` | Cero vulnerabilidades tras la actualización de herramientas de desarrollo. |
| `npm run assets:store` | Generación correcta; cuatro imágenes inspeccionadas. |
| `npm run test:extension` | Nueva pestaña, popup, recarga, atajos y exportación/restauración de un backup ZIP con vídeo correctos bajo Manifest V3, tanto desde el origen como desde el paquete extraído; sin errores de página. |
| `git diff --check` | Sin errores de espacios o conflictos. |

Artefacto: `dist/newdesktab-0.27.0.zip`, 2.320.562 bytes y 225 archivos.
Incluye únicamente recursos de la extensión, licencia y política de privacidad.
El empaquetador comprueba cada entrada y su contenido contra el origen.

SHA-256:

```text
75e056c0388562f285f599ee01fa3a2d9dabe7663a79ee6d6584685b1d49064b
```

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

## Comprobaciones antes de enviar a la Store

1. Verificar Chrome Sync entre dos perfiles o dispositivos reales, incluyendo
   edición simultánea, cambio a modo local y eliminación del dato sincronizado.
   Las pruebas automatizadas cubren almacenamiento y mezcla de cambios, pero
   no la propagación del servicio de perfiles de Google.
2. Instalar el ZIP extraído en Chrome y Brave, comprobar el guardado desde el
   botón de la extensión y hacer un recorrido breve con teclado y ratón.
   La prueba automatizada de extensión utiliza Chromium.
3. Comprobar que la clave del manifiesto corresponde a la ficha, y revisar
   descripción, privacidad, correo de contacto y verificación en dos pasos.
   Las imágenes ya se regeneraron e inspeccionaron en esta revisión; repetir
   ese paso si cambia la interfaz antes del envío.

La publicación en la Store queda pendiente de las comprobaciones anteriores.
