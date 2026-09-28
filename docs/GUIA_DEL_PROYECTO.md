# Guía técnica de NewDeskTab

Esta guía explica cómo funciona NewDeskTab, cómo se distribuyen sus
responsabilidades y dónde debe realizarse cada tipo de cambio. Está pensada
como documento de incorporación para desarrolladores y como referencia durante
la evolución del proyecto.

> **Nombre del producto:** NewDeskTab  
> **Tipo de aplicación:** extensión Chromium Manifest V3  
> **Tecnología principal:** JavaScript ES modules, HTML y CSS nativos  
> **Versión descrita:** 0.19.0

## 1. Visión general

NewDeskTab sustituye la página de nueva pestaña del navegador por un escritorio
visual. En él, el usuario puede organizar bookmarks, carpetas y, progresivamente,
widgets dentro de distintos workspaces.

La aplicación no tiene servidor propio. El estado se guarda en el perfil del
navegador mediante `chrome.storage.local` o, cuando el navegador es compatible,
mediante `chrome.storage.sync`.

El sistema puede resumirse así:

```text
newtab.html
    ↓
main.js
    ↓
app/bootstrap.js ─────────────── composición e inicialización
    ↓
features ──────── domain ─────── casos de uso y reglas
    ↓                 ↓
shared ───────── platform ────── mecanismos y acceso al navegador
    ↓                 ↓
state/appStore.js ────────────── estado vivo y cola de persistencia
    ↓
app/appController.js ─────────── efectos visuales posteriores
    ↓
DOM
```

Las fronteras principales son `app`, `domain`, `features`, `platform`, `shared`,
`state` y `widgets`. Las antiguas carpetas transitorias `core` y `ui` ya no
existen: cada módulo tiene un propietario arquitectónico explícito.

## 2. Principios de diseño

### 2.1 Una sola fuente de verdad

El estado en memoria de `state/appStore.js` es la fuente de verdad durante la
ejecución. La interfaz no debe modificar objetos persistidos directamente.
Toda operación de negocio termina produciendo un cambio mediante `setState()`.

### 2.2 Reglas separadas de efectos

Una regla como “esta área del grid está libre” debe poder ejecutarse sin DOM ni
APIs de Chrome. Una acción como “guardar esta disposición” sí puede coordinar
el store y la persistencia.

En términos prácticos:

- `domain` y los algoritmos de `shared` calculan y validan.
- `features` traducen intenciones del usuario en cambios de estado.
- `platform` habla con Chrome y el dispositivo.
- `app` conecta las piezas y reacciona a los cambios globales.

### 2.3 Cambios atómicos

Una interacción debe producir un único cambio coherente. Por ejemplo, mover un
bookmark y desplazar otro no son dos operaciones independientes: ambas
posiciones se guardan en una transición, generando una sola entrada de undo.

### 2.4 Tipos de grid extensibles

El grid no debe conocer los detalles de cada entidad. Bookmarks, carpetas,
papelera y widgets se adaptan al mismo protocolo mediante
`shared/grid/gridItemRegistry.js`.

### 2.5 Datos externos siempre normalizados

Cualquier dato procedente de almacenamiento, sincronización o importación
atraviesa `migratePersistedData()`. El resto de la aplicación puede trabajar
asumiendo que el esquema ya es válido y actual.

## 3. Arranque de la aplicación

El manifiesto declara `src/newtab.html` como sustitución de la nueva pestaña.
El HTML carga `src/js/main.js`, que llama a `startApplication()`.

`app/bootstrap.js` ejecuta, en este orden, las siguientes tareas:

1. Obtiene los nodos principales del DOM.
2. Registra los tipos de grid incluidos en la aplicación.
3. Hidrata y migra los datos persistidos.
4. Purga las entradas caducadas de la papelera.
5. Garantiza una posición válida para la papelera.
6. Aplica el tema de interfaz.
7. Precarga las imágenes locales necesarias.
8. Inicializa el idioma.
9. Crea el controlador global de la aplicación.
10. Suscribe dicho controlador al store y a actualizaciones remotas.
11. Inicializa modales, toolbar, teclado, historial y controladores del grid.
12. Expone las herramientas de diagnóstico.

El orden es deliberado: ninguna vista debería inicializarse antes de disponer
de datos normalizados e idioma.

### Archivos principales del arranque

| Archivo | Responsabilidad |
|---|---|
| `src/js/main.js` | Entrada mínima de JavaScript |
| `src/js/app/bootstrap.js` | Orden de inicialización e inyección de dependencias |
| `src/js/app/registerGridItemTypes.js` | Registro de tipos incluidos en el grid |
| `src/js/app/appController.js` | Efectos globales posteriores a un cambio de estado |
| `src/js/app/appStateChanges.js` | Clasificación pura de qué parte del estado cambió |
| `src/js/app/appShell.js` | Resize global y representación del modo edición |

## 4. Capas y reglas de dependencia

### `app/`: composición

Conoce las implementaciones concretas y las conecta. Puede importar features,
servicios de plataforma y componentes compartidos. No debe contener reglas de
bookmarks, carpetas, workspaces o papelera.

### `domain/`: modelo de negocio

Contiene entidades, invariantes, validación y normalización determinista.
No puede acceder al DOM, al store ni a APIs de Chrome.

```text
domain/
├── bookmarks/      bookmark, URL, estilo y presets
├── folders/        carpeta y disposición interna
├── recycle-bin/    entradas, restauración y caducidad
├── settings/       preferencias portables
└── workspaces/      identidad y navegación entre escritorios
```

### `features/`: capacidades del producto

Contiene los casos de uso que reconoce el usuario. Una feature puede combinar
dominio, mecanismos compartidos, UI y store.

```text
features/
├── bookmarks/      creación, edición, tarjeta y preview
├── folders/        acciones, tarjeta, editor y modal interior
├── grid/           render, selección, drag, resize y teclado
├── history/        controles de undo y redo
├── keyboard/       coordinación de atajos con controles y modales
├── launcher/       menú flotante de creación
├── recycle-bin/    eliminación, restauración y presentación
├── search/         búsqueda global y filtros locales
├── settings/       modal, borrador y secciones de preferencias
└── workspaces/      acciones, selectores y toolbar
```

### `platform/`: adaptadores externos

Encapsula aquello que depende del navegador o del dispositivo.

```text
platform/
├── browser/        detección de capacidades y compatibilidad Sync
├── i18n/           carga y aplicación de traducciones
├── images/         almacenamiento y resolución de imágenes locales
├── storage/        persistencia, esquema y datos específicos del dispositivo
└── sync/           serialización por bloques para chrome.storage.sync
```

El dominio nunca debe importar esta capa.

### `shared/`: mecanismos reutilizables

Alberga código que ya ha demostrado ser común a varias features.

- `shared/grid`: geometría, placement, resize, movimiento y registro de tipos.
- `shared/ui`: modales, alertas, flashes, viewport y primitivas visuales.
- `shared/keyboard`: representación y resolución de atajos.
- `shared/data`: reconciliación de cambios persistidos.
- `shared/images`: formato portable de referencias a imágenes.

Una función no debe trasladarse aquí solo porque tenga dos consumidores. Debe
representar un mecanismo genérico sin reglas específicas de una feature.

### `widgets/`: plataforma de widgets incluidos

Esta carpeta define el contrato común de widgets empaquetados con la extensión.
No es un sistema de plugins remotos.

- `widgetModel.js`: formato persistido y normalización.
- `widgetRegistry.js`: validación, inicialización y adaptación al protocolo del grid.
- `widgetActions.js`: alta, actualización y eliminación de instancias.
- `builtin/index.js`: catálogo único de widgets incluidos en esta build.
- `builtin/clock/`: primer widget visible, con modelo, vista y configuración.

### `state/`: estado vivo de la aplicación

Esta carpeta es una frontera explícita, no una zona genérica para reglas de
negocio:

- `appStore.js`: fuente de verdad en memoria, suscripciones, hidratación y cola
  de persistencia.
- `gridHistory.js`: snapshots transitorios y acotados de undo/redo.
- `stateChangeDescription.js`: clasificación segura de cambios para diagnóstico.

Los defaults de entidades y ajustes pertenecen a sus dominios, y
`platform/storage/persistedDataDefaults.js` compone una instancia aislada del
contrato persistido completo. El shell pertenece a `app`, la presentación de
cada dominio a su feature y solo las primitivas demostrablemente reutilizables
viven en `shared/ui`.

## 5. Modelo de estado

El estado tiene dos ramas diferenciadas:

```text
AppState
├── data                         persistente
│   ├── schemaVersion
│   ├── bookmarks[]
│   ├── folders[]
│   ├── widgets[]
│   ├── recycleBin
│   ├── trash[]
│   └── settings
└── ui                           transitoria
    ├── isEditing
    ├── persistence
    └── history
```

`data` se guarda en Chrome. `ui` describe el estado de la sesión y no forma
parte del payload persistido.

### Bookmarks

Un bookmark posee identidad, URL, apariencia, workspace y rectángulo de grid.
La pertenencia a una carpeta se expresa mediante `folderId`.

Un bookmark dentro de una carpeta conserva su tamaño principal, pero deja de
reservar espacio en el grid superior.

### Carpetas

Las carpetas son entidades independientes dentro de `data.folders`. No pueden
contener otras carpetas. Sus bookmarks deben pertenecer al mismo workspace.

La disposición interior normal es de 6 columnas por 3 filas, con capacidad
para 18 bookmarks. Los datos heredados que superen esa capacidad siguen siendo
accesibles mediante filas adicionales desplazables.

### Widgets

Todos los widgets comparten este sobre conceptual:

```js
{
  id,
  type,
  version,
  gx, gy, w, h,
  groupId,
  config,
  createdAt,
  updatedAt
}
```

`config` es opaco para el núcleo: cada tipo de widget es responsable de
interpretarlo y migrarlo cuando corresponda. Los adapters de widgets son
seleccionables por defecto: la capa genérica permite moverlos entre workspaces
sin conocer su configuración.

### Papelera

La papelera tiene su propia posición y apariencia. `trash` contiene copias de
bookmarks o conjuntos carpeta-contenido, acompañadas por la fecha de borrado.
Las entradas caducan después de 28 días.

Mientras `trash` no tenga un formato versionado para widgets, arrastrar uno a
la papelera o eliminarlo desde una selección solicita confirmación y lo borra
definitivamente. No se crea una entrada que después no pueda restaurarse.

### Settings y workspaces

Los workspaces se almacenan actualmente dentro de `settings.bookmarkGroups` y
el activo en `settings.activeBookmarkGroupId`. El workspace principal se
representa con `null`.

Las preferencias incluyen idioma, tema, comportamiento de drag y resize,
atajos, presets y visibilidad de la papelera.

## 6. Store, historial y ciclo de actualización

`state/appStore.js` coordina tres responsabilidades principales:

1. Mantener el estado actual en memoria.
2. Aplicar el historial que encapsula `state/gridHistory.js`.
3. Persistir cambios y notificar suscriptores.

### Qué sucede en `setState()`

1. Conserva el estado anterior.
2. Detecta si cambió contenido relevante del grid.
3. Si procede, guarda una instantánea en undo y vacía redo.
4. Fusiona la actualización en `data` y `ui`.
5. Marca la persistencia como `saving`.
6. Encola la escritura para conservar el orden de las operaciones.
7. Reconcilia cambios concurrentes cuando el adaptador lo solicita.
8. Marca la persistencia como `saved` o `error`.
9. Notifica a todos los listeners.

El historial conserva un máximo de 50 snapshots. Incluye bookmarks, carpetas,
widgets, papelera y trash. No incluye el modo de almacenamiento, evitando que
un undo cambie accidentalmente de Local a Sync. La etiqueta legible usada por
el trazado se calcula aparte en `state/stateChangeDescription.js`.

### Reacción visual

`appController` recibe el estado nuevo y el anterior. `appStateChanges.js`
clasifica si cambiaron settings, grid o modo edición. A partir de ahí:

- Un cambio de grid provoca render.
- Un cambio de tema o idioma actualiza sus adaptadores.
- Salir de edición limpia la selección.
- Un cambio exclusivamente transitorio evita trabajo innecesario.

## 7. Sistema de grid

El grid visual principal mide 12 columnas por 6 filas lógicas. Los elementos
poseen `gx`, `gy`, `w` y `h`.

### Registro de tipos

Un tipo de grid aporta como mínimo:

```js
{
  type,
  selector,
  getElementId,
  select,
  render
}
```

Opcionalmente puede aportar:

```js
{
  enableEditing,
  selectable,
  clearKeyboardOnOpen,
  open,
  edit,
  remove,
  getRemovalConfirmation
}
```

Esto permite que `gridRenderer`, la navegación por teclado y las acciones
comunes operen sobre capacidades, no sobre tipos codificados manualmente.

Los adaptadores incorporados se encuentran en:

- `features/bookmarks/bookmarkGridItem.js`
- `features/folders/folderGridItem.js`
- `features/recycle-bin/recycleBinGridItem.js`

### Render

`gridRenderer.js` consulta el registry para obtener los elementos visibles del
workspace actual. Cada definición crea su DOM y, si el modo edición está activo,
recibe la oportunidad de añadir controles.

El renderer coordina; no decide cómo se representa una carpeta ni qué hace un
bookmark al abrirse.

### Drag y resize

`gridPointerController.js` interpreta el gesto:

- Diferencia click corto de drag.
- Crea previews de movimiento.
- Detecta drops sobre carpetas o papelera.
- Gestiona las ocho direcciones de resize.
- Confirma el resultado mediante una actualización atómica.
- Restaura el rectángulo original si el gesto no es válido.

Los cálculos puros viven en:

- `shared/grid/resizeGeometry.js`
- `shared/grid/smartDragLayout.js`
- `shared/grid/gridPlacement.js`
- `shared/grid/gridGeometry.js`

Los modos de drag son:

- `none`: solo admite áreas libres.
- `relocate`: recoloca los bloqueadores.
- `cascade`: desplaza una secuencia hacia un hueco; se muestra como experimental.

### Selección y operaciones masivas

La selección es transitoria y vive en `features/grid/gridSelection.js`, fuera
del estado persistido. Las operaciones masivas consumen una lista de pares
`{ kind, id }`, lo que permite combinar bookmarks y carpetas.

### Teclado

`gridKeyboardController.js` controla el foco explícito del grid:

- `Tab` entra o sale del modo de navegación.
- Las flechas buscan la ruta espacial más adecuada.
- `Enter` abre o edita según el modo actual.
- `S` selecciona tipos que declaren `selectable: true`.

`gridKeyboardMovement.js` tiene una responsabilidad diferente: mover con las
flechas un único elemento seleccionado cuando la navegación explícita no está
activa.

La selección de rutas se calcula en el módulo puro
`shared/grid/gridKeyboardRoute.js`.

## 8. Flujos funcionales representativos

### Crear un bookmark

```text
floatingMenu / shortcut
    → bookmarkModal
    → bookmarkEditorPanel valida el borrador
    → bookmarkActions busca posición libre
    → store.setState
    → storageFacade persiste
    → appController detecta cambio de grid
    → gridRenderer vuelve a pintar
```

El editor no conoce la persistencia ni calcula posiciones. Devuelve un borrador
válido al controlador que lo abrió.

### Arrastrar un elemento

```text
pointerdown
    → gridPointerController
    → smartDragLayout calcula un preview reversible
    → pointerup confirma la disposición
    → gridItemActions actualiza todos los implicados juntos
    → store crea una única entrada de undo
```

### Eliminar y restaurar

```text
acción de eliminar
    → recycleBinActions crea una entrada trash
    → bookmark/carpeta desaparece del grid
    → store persiste ambas partes atómicamente

acción de restaurar
    → recycleBinEntries calcula un destino válido
    → recycleBinActions restaura entidad y pertenencia
    → elimina la entrada trash
```

Una carpeta se elimina y restaura junto con sus bookmarks.

### Guardar Settings

El modal trabaja sobre `settingsDraft`, no sobre el estado real. Solo al
confirmar se construyen los settings definitivos y se ejecutan las acciones
correspondientes. Cancelar el modal no deja cambios parciales.

## 9. Persistencia, Sync y concurrencia

### Local

Es el modo inicial y utiliza `chrome.storage.local`. Los datos permanecen en el
perfil del navegador.

### Sync

Solo se ofrece cuando `browserCapabilities.js` identifica Google Chrome como
compatible. El payload versionado se serializa y divide en fragmentos para
respetar las cuotas de `chrome.storage.sync`.

La selección Local/Sync es específica del dispositivo. Los datos funcionales y
los atajos sí forman parte del payload sincronizable.

### Borrado local y borrado remoto

“Borrar todos los datos locales” elimina del dispositivo los favoritos,
carpetas, widgets, ajustes, papelera, selecciones de imagen y todos los archivos
de imagen propiedad de NewDeskTab. Si Sync está activo, primero cambia el
dispositivo a Local con un estado vacío. El payload de la nube no se escribe ni
se elimina. Su borrado es una acción distinta y explícita dentro de la sección
Sync.

Al borrar el payload remoto, todos los dispositivos que lo estuvieran usando
abandonan Sync. Los que estén abiertos guardan localmente el último estado que
estaban mostrando; los que estén cerrados detectan la ausencia al iniciarse y
recuperan su última copia local. Ningún dispositivo vuelve a crear
automáticamente los datos eliminados de la nube.

### Compatibilidad futura

Si una instalación antigua encuentra datos escritos con un esquema posterior,
no los sobrescribe. Vuelve a datos locales compatibles y muestra un aviso hasta
que la extensión pueda interpretar la versión remota.

### Cambios simultáneos

Las escrituras se procesan mediante una cola. Si el adaptador detecta una base
más reciente, `shared/data/mergeChanges.js` reconcilia el snapshot preparado,
el estado local actual y los últimos datos persistidos.

Esto reduce pérdidas entre pestañas del mismo dispositivo, pero no constituye
un sistema distribuido de resolución total de conflictos.

## 10. UI, modales, estilos e idioma

### Documento HTML

`src/newtab.html` contiene los hosts principales y la estructura estática de
los modales. Los componentes dinámicos se crean desde las features.

### Modales

`shared/ui/modalManager.js` centraliza:

- Registro y apilado.
- Apertura y cierre.
- Focus trap.
- Aislamiento del fondo.
- Restauración del foco.
- Adaptación a viewport compacto.

Una feature controla el contenido y las acciones de su modal, pero no debería
reimplementar estas responsabilidades.

### CSS

`src/styles/main.css` es la única entrada cargada por el documento. Los estilos
globales ya tienen propietarios estables:

```text
styles/base/       reset, variables, canvas y scrollbar
styles/utilities/  estados transversales como hidden o disabled
js/shared/ui/      estilos de modales, editores y notificaciones compartidas
js/features/grid/  viewport, overlay y geometría responsive del grid
```

Durante la migración, esta entrada también importa las hojas todavía pendientes
en `src/css/`. Los estilos compartidos y del grid ya viven junto a su propietario;
el resto se moverá del mismo modo. Todo CSS de `src/` debe ser alcanzable desde
`styles/main.css`; una prueba estructural detecta imports rotos, ciclos y hojas
huérfanas.

### Internacionalización

Los catálogos están en `src/js/lang/`. `platform/i18n/i18n.js` resuelve idioma,
traduce claves y actualiza atributos `data-i18n` del DOM.

El texto visible nuevo debe añadirse a todos los idiomas compatibles y
consumirse mediante `t()` o atributos de traducción; no debe quedar codificado
en una feature.

### Imágenes locales

Los archivos subidos permanecen en almacenamiento local del dispositivo. El
estado sincronizable conserva referencias portables, no el contenido binario.
`platform/images/localImages.js` resuelve dichas referencias antes del render.

## 11. Cómo incorporar un widget

Un widget incluido debe seguir este proceso:

1. Crear su definición visual en una carpeta propia.
2. Definir un `type` kebab-case estable.
3. Implementar `render()`.
4. Añadir hooks opcionales de edición o interacción.
5. Si tiene editor, implementar `initialize({ launcher, modalHost })` para que
   el propio widget monte su botón y su superficie de configuración.
6. Añadir la definición al catálogo `widgets/builtin/index.js`.
7. Crear instancias mediante `addWidget()`.
8. Añadir normalización versionada de su `config` si la necesita.
9. Cubrir modelo, registry, acciones, DOM y recorrido visible con tests.

El widget no debe modificar `gridRenderer` ni
`gridKeyboardController`, añadir imports propios a `bootstrap.js` ni insertar
su modal en `newtab.html`. Si necesita hacerlo para aparecer, falta una
capacidad genérica en el contrato y debe diseñarse como tal.

## 12. Dónde realizar cada cambio

| Necesidad | Destino principal |
|---|---|
| Cambiar una validación de bookmark | `domain/bookmarks/` |
| Cambiar el efecto de “crear bookmark” | `features/bookmarks/bookmarkActions.js` |
| Cambiar su HTML dinámico | `features/bookmarks/bookmarkCard.js` |
| Cambiar reglas internas de carpetas | `domain/folders/` |
| Cambiar el modal de una carpeta | `features/folders/` |
| Cambiar colisiones o placement | `shared/grid/` |
| Cambiar cómo se interpreta un gesto | `features/grid/gridPointerController.js` |
| Añadir una acción común de grid | `features/grid/gridItemActions.js` |
| Cambiar persistencia o migraciones | `platform/storage/` |
| Cambiar sincronización por bloques | `platform/sync/` |
| Cambiar el efecto global de un estado | `app/appController.js` |
| Crear una primitiva modal reutilizable | `shared/ui/` |
| Añadir una preferencia | `domain/settings`, `features/settings` y esquema |
| Añadir un tipo visual de grid | adapter de feature o `widgets/` + registry |
| Añadir texto visible | feature correspondiente + todos los catálogos `lang/` |

## 13. Pruebas y validación

El proyecto utiliza cuatro niveles complementarios:

1. **ESLint:** errores estáticos, imports y símbolos no utilizados.
2. **Node Test Runner:** dominio, esquemas, store, storage y algoritmos.
3. **Vitest + jsdom:** componentes y ciclos de vida DOM.
4. **Playwright:** recorridos completos en navegador.

Comandos habituales:

```sh
npm run check          # lint + unit + DOM
npm run test:e2e       # recorridos Playwright
npm run test:extension # extensión real cargada en Chromium
npm run package:store  # ZIP de distribución
```

### Qué prueba debe añadirse

- Regla pura nueva: test unitario.
- Cambio de schema o migración: test de `dataSchema` con datos antiguos.
- Componente o modal: test DOM.
- Interacción visible entre módulos: E2E.
- Cambio de manifest, arranque o persistencia real: smoke de extensión.

`tests/projectHealth.test.mjs` protege además reglas estructurales del proyecto.

## 14. Diagnóstico

Con la nueva pestaña abierta puede activarse el diagnóstico desde DevTools:

```js
NewDeskTabDebug.toggle()
await NewDeskTabDebug.report()
NewDeskTabDebug.history()
NewDeskTabDebug.clear()
```

El informe incluye versión, almacenamiento activo, soporte Sync, uso de cuota,
conteos y tiempos de arranque. Las trazas de operaciones muestran preparación,
espera en cola y escritura.

`shared/diagnostics/debug.js` implementa el logger acotado sin conocer el estado
de la aplicación. `app/applicationDiagnostics.js` reúne store, plataforma y
ciclo de arranque para construir el informe visible en DevTools.

## 15. Invariantes que no deben romperse

- El dominio no accede al DOM ni a Chrome.
- Los datos externos pasan por el schema antes de usarse.
- Un bookmark y su carpeta pertenecen siempre al mismo workspace.
- Las carpetas no pueden anidarse.
- Los elementos dentro de carpetas no ocupan el grid principal.
- Una operación con varios desplazamientos se confirma atómicamente.
- La selección del grid no se persiste.
- La preferencia Local/Sync es específica del dispositivo.
- Una versión antigua nunca sobrescribe datos remotos de una versión futura.
- Los widgets desconocidos pueden conservarse aunque todavía no se rendericen.
- Los modales restauran el foco mediante el gestor compartido.
- Los textos visibles deben estar internacionalizados.

## 16. Errores de diseño frecuentes

Evitar los siguientes patrones:

- Importar una feature desde `domain`.
- Calcular colisiones directamente en un modal.
- Escribir en `chrome.storage` desde una feature.
- Cambiar objetos obtenidos de `getState()` esperando que se persistan.
- Añadir condicionales por tipo dentro del renderer genérico.
- Duplicar gestión de foco o stacking de modales.
- Guardar estados temporales de hover, selección o drag en el payload.
- Añadir un archivo a `shared` sin que represente una abstracción estable.
- Realizar dos `setState()` para una sola acción lógica del usuario.

## 17. Estado actual y siguiente evolución

La separación de dominio, features, plataforma, estado, UI compartida y grid ya
está establecida. El reloj valida el contrato de widgets de extremo a extremo y
las carpetas transitorias `ui/` y `core/` han sido retiradas. Las principales
zonas de evolución son:

1. Mejorar la recuperación de conflictos entre dispositivos.
2. Versionar entradas de papelera para widgets si deben poder restaurarse.
3. Seguir extrayendo del store solo responsabilidades que obtengan un contrato y
   pruebas propios; `state/` no debe convertirse en un nuevo cajón genérico.

Para las reglas arquitectónicas exhaustivas y el historial de la migración,
consultar también [`ARCHITECTURE.md`](ARCHITECTURE.md).
