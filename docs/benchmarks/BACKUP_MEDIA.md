# Medición de backups con vídeos locales

Ejecutada el 9 de octubre de 2026 en Windows con Chromium 151. Cada tamaño
utiliza un perfil persistente nuevo, como el almacenamiento de una instalación
normal. Datos reproducibles: [backup-media.json](backup-media.json).

```sh
node scripts/benchmark-backups.mjs
node scripts/benchmark-backups.mjs --sizes=200
```

| Vídeo | Exportación | Importación | JSON generado | Mayor muestra de memoria JS |
| --- | --- | --- | --- | --- |
| 10 MiB | 0,11 s | 0,12 s | 13,34 MiB | 71,2 MiB |
| 50 MiB | 0,57 s | 0,55 s | 66,67 MiB | 271,1 MiB |
| 200 MiB | 2,10 s | 2,64 s | 266,67 MiB | 1.070,9 MiB |

Se ejecutan las acciones reales de exportación e importación y se restauran los
archivos en IndexedDB. Antes de importar se eliminan los datos locales. La
verificación comprueba el tamaño restaurado, la disponibilidad de la URL local
y los bytes iniciales y finales del archivo. Los datos contienen texto Unicode
para incluir su efecto sobre la representación del JSON en memoria.

El vídeo es un archivo sintético con MIME WebM: mide almacenamiento y transporte,
sin medir reproducción ni decodificación. La descarga a disco se intercepta para
medir la generación del Blob JSON. La memoria procede de muestras en
`JSON.stringify`, `JSON.parse` y puntos de control CDP; no representa toda la RAM
del proceso ni garantiza capturar el máximo absoluto. Son mediciones locales de
una ejecución, no límites ni promesas de rendimiento en otros equipos.

## Decisión

Se conserva el formato JSON compatible en esta revisión. Los tres tamaños
completan el ciclo de exportación y restauración en un perfil persistente,
incluido el límite de 200 MiB por vídeo.

Base64 aumenta el archivo aproximadamente un tercio y las copias de cadenas
elevan la memoria mucho más. Un archivo grande puede superar 1 GiB de memoria JS
observada; varios vídeos grandes no quedan validados por esta prueba. Para una
futura versión del backup se recomienda un contenedor con metadatos JSON y
archivos binarios separados, procesados progresivamente, manteniendo la
importación del formato anterior. No se ha implementado ese formato nuevo.

En la exploración inicial, un contexto efímero de Chromium no pudo leer el Blob
restaurado de 200 MiB aunque la transacción de IndexedDB terminara. La medición
definitiva usa perfiles persistentes y verifica la lectura de los archivos. El
resultado no establece compatibilidad de ese tamaño con sesiones de incógnito.
