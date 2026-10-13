# Auditoría de acciones y limpieza de la release

La auditoría combina los recorridos E2E, las mediciones optativas de Debug,
la respuesta visual de los controles y el análisis estático del código.
Los perfiles del navegador son aislados; no se usa un perfil personal.

## Repetir la auditoría

En PowerShell, desde la raíz del repositorio:

```powershell
npm run check
$env:NEWDESKTAB_AUDIT_DIR = 'dist/release-audit/actions-new-run'
npm run test:e2e
Remove-Item Env:NEWDESKTAB_AUDIT_DIR
npm run audit:actions -- dist/release-audit/actions-new-run dist/release-audit/actions-summary.json
npm run audit:source -- dist/release-audit/source-summary.json
npm run benchmark:ui -- dist/release-audit/ui-performance.json
node scripts/benchmark-backups.mjs --sizes=10,50,200 --output=dist/release-audit/backup-performance.json
npm run test:extension
```

Usa un directorio nuevo en cada ejecución completa para no mezclar casos de
ejecuciones interrumpidas o versiones anteriores. La suite usa un solo worker,
sin reintentos configurados. La auditoría no se activa en las ejecuciones E2E
normales. Para medir a velocidad normal de CPU, establece
`$env:NEWDESKTAB_BENCHMARK_CPU = '1'` antes del benchmark; su valor por defecto
es una limitación de CPU de 4×.
Ejecuta los benchmarks cuando haya terminado la suite, sin otra ejecución de
tests compitiendo por CPU. El argumento `--output` del benchmark de backups
conserva los resultados históricos y guarda la medición nueva en otro archivo.

La cobertura unitaria de los módulos de fuente cargados por Node se puede medir
por separado; no incluye DOM/E2E ni los módulos que no cargan esos tests:

```powershell
node --experimental-test-coverage --test --test-coverage-include=src/** tests/*.test.mjs
```

Si se añaden regresiones después de la suite completa sin cambiar el código de
producto, guárdalas en otro directorio y pásalo como argumento adicional de
`audit:actions`. El informe debe distinguir las ejecuciones y usar cada caso
una sola vez. Con cambios de producto, repite la suite completa.

## Qué mide cada dato

- **Debug:** duración del trabajo identificado por cada registro. Las acciones
  persistidas incluyen preparación, espera en la cola, escritura y notificación.
  La apertura genérica de un modal mide la preparación de su superficie y
  programa el foco; no equivale a todo el trabajo de un editor.
- **Benchmark:** JavaScript síncrono de trece operaciones concretas, separado
  del tiempo hasta dos `requestAnimationFrame`. Cada operación usa dos
  calentamientos y seis muestras; se informa la mediana.
- **Respuesta visual E2E:** desde la captura de un evento de clic, entrada,
  cambio, teclado, fin de gesto o foco hasta dos cuadros de animación. Incluye
  espera de cuadros y puede incluir animaciones; no mide la finalización de
  una importación, descarga o escritura asíncrona.
- **Backup:** duración completa de exportación e importación de vídeos
  sintéticos de 10, 50 y 200 MiB mediante las acciones reales e IndexedDB.
  Comprueba tamaño y extremos de los bytes restaurados; la descarga a disco
  y la decodificación del vídeo quedan fuera de esta medición.
- **Cobertura de JavaScript:** funciones V8 observadas en las páginas principales
  de los tests. No es cobertura de líneas ni de ramas. **CSS:** unión de rangos
  que Chromium ha visto aplicar durante los recorridos. Los contextos de
  extensión creados por algunos tests se verifican funcionalmente por separado.

Los errores de Debug se cuentan por separado de los resultados E2E: varias
pruebas provocan fallos de cuota, escritura o importación para comprobar su
recuperación. Los E2E también incluyen retardos y relojes simulados: sus
percentiles describen esos recorridos; el benchmark controlado sirve para
comparar rendimiento. Un tiempo de guardado local o Sync corresponde a la escritura del
navegador; la propagación entre dispositivos ocurre después.

## Revisar candidatos sin eliminar comportamiento necesario

`audit:source` sigue el grafo de las entradas de nueva pestaña y popup, encuentra
exportaciones sin llamadas desde producción y busca clases CSS sin referencia
literal. Las clases generadas por plantillas tienen referencias revisadas y
declaradas. El análisis conserva explícitamente la API de registro de widgets
y el exportador de vídeos de backups JSON antiguos, comprobados por sus tests.

Una función o regla no ejecutada en los E2E no es automáticamente código muerto:
puede cubrir errores, navegadores, tamaños de pantalla, accesibilidad o una API
pública. La eliminación requiere contrastar código, DOM, tests y compatibilidad.
La prueba de salud del proyecto comprueba permanentemente que todas las hojas
CSS y los módulos JavaScript siguen conectados a una entrada de la aplicación.

## Debug en otro equipo

En DevTools, `NewDeskTabDebug.toggle()` activa los registros. Para recoger más
de las cien operaciones del historial durante una sesión:

```js
const timings = [];
const unsubscribe = NewDeskTabDebug.subscribe(record => timings.push(record));
// Realiza las acciones que quieras medir.
unsubscribe();
console.table(timings.map(({ label, durationMs, status }) => ({ label, durationMs, status })));
```

Los resultados de Windows/Chromium, con red externa bloqueada en los tests,
no sustituyen una medición en el Mac ni una comprobación de Sync entre equipos.
