# Medición de backups con vídeos locales

Ejecutada el 9 y el 10 de octubre de 2026 en Windows con Chromium 151. Cada tamaño
utiliza un perfil persistente nuevo, como el almacenamiento de una instalación
normal. Baseline JSON: [backup-media.json](backup-media.json).
ZIP: [backup-media-zip.json](backup-media-zip.json) y
[dos vídeos de 200 MiB](backup-media-zip-2-videos.json).

```sh
node scripts/benchmark-backups.mjs
node scripts/benchmark-backups.mjs --sizes=200
node scripts/benchmark-backups.mjs --sizes=200 --count=2
```

## Formato JSON anterior

| Vídeo | Exportación | Importación | JSON generado | Mayor muestra de memoria JS |
| --- | --- | --- | --- | --- |
| 10 MiB | 0,11 s | 0,12 s | 13,34 MiB | 71,2 MiB |
| 50 MiB | 0,57 s | 0,55 s | 66,67 MiB | 271,1 MiB |
| 200 MiB | 2,10 s | 2,64 s | 266,67 MiB | 1.070,9 MiB |

## Formato ZIP aplicado

| Vídeo | Exportación | Importación | ZIP generado | Mayor muestra de memoria JS |
| --- | --- | --- | --- | --- |
| 10 MiB | 0,07 s | 0,10 s | 10,00 MiB | 45,3 MiB |
| 50 MiB | 0,42 s | 0,53 s | 50,00 MiB | 79,7 MiB |
| 200 MiB | 1,12 s | 1,79 s | 200,00 MiB | 79,5 MiB |
| 2 × 200 MiB | 2,09 s | 3,20 s | 400,00 MiB | 80,0 MiB |

La muestra de 200 MiB baja de 1.070,9 a 79,5 MiB de memoria JS observada.
El ZIP añade unos pocos KiB de metadatos; evita el crecimiento de un tercio
debido a base64. La prueba con dos archivos mantiene una muestra similar de
memoria mientras crece el tamaño final del archivo.

Se ejecutan las acciones reales de exportación e importación y se restauran los
archivos en IndexedDB. Antes de importar se eliminan los datos locales. La
verificación comprueba el tamaño restaurado, la disponibilidad de la URL local
y los bytes iniciales y finales de cada archivo. Los datos contienen texto Unicode
para incluir su efecto sobre la representación del JSON en memoria.

El vídeo es un archivo sintético con MIME WebM: mide almacenamiento y transporte,
sin medir reproducción ni decodificación. La descarga a disco se intercepta para
medir la generación del Blob de descarga. En el baseline JSON, la memoria procede
de muestras en `JSON.stringify`, `JSON.parse` y puntos de control CDP. La medición
ZIP añade muestras cada 10 ms y al crear el Blob. La frecuencia difiere; ninguna
representa toda la RAM del proceso ni garantiza capturar el máximo absoluto.
Son mediciones locales de
una ejecución, no límites ni promesas de rendimiento en otros equipos.

## Decisión

Se aplica ZIP cuando hay vídeos locales. `backup.json` contiene configuración,
imágenes optimizadas y metadatos; los vídeos se guardan como archivos binarios
separados con ZIP STORE, sin recomprimir. La lectura y escritura se realizan
secuencialmente en bloques de 256 KiB. El Blob final lo gestiona el navegador;
el código evita cargar vídeos completos en cadenas o arrays JavaScript.

Los tres tamaños y dos vídeos de 200 MiB completan exportación y restauración en
perfiles persistentes. Sin vídeos locales se conserva JSON; los backups JSON
anteriores, incluidos sus vídeos base64, siguen siendo importables. Las imágenes
mantienen su representación optimizada existente. Las muestras no validan todos
los tamaños posibles de bibliotecas ni sustituyen mediciones de toda la RAM.

En la exploración inicial, un contexto efímero de Chromium no pudo leer el Blob
restaurado de 200 MiB aunque la transacción de IndexedDB terminara. La medición
definitiva usa perfiles persistentes y verifica la lectura de los archivos. El
resultado no establece compatibilidad de ese tamaño con sesiones de incógnito.
