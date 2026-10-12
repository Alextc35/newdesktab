# Notas de versión

La primera pestaña abierta con una versión nueva muestra sus notas en el centro.
El aviso aparece una sola vez por perfil, también en la primera instalación.
Las notas de 1.0.0 incluyen la historia del autor, su agradecimiento, seis bloques
de funciones principales y el estado del reloj como widget en desarrollo.

## Llegada y consulta

- El aviso precede a la guía de bienvenida en un perfil nuevo.
- Al cerrar las notas se ofrece la guía si este perfil todavía no la ha visto.
- El consejo diario aparece después de cerrar esos diálogos, si está activado y
  corresponde al día. Permanece abajo a la derecha; su temporizador avanza durante
  la lectura y se pausa por cursor, foco, otra ventana de diálogo o pestaña oculta.
- Cada consejo muestra el SVG de su tema y puede abrir su sección del manual.
- Ajustes → Ayuda reúne el buscador del manual, las respuestas habituales, la
  guía rápida y la preferencia de consejos diarios.
- En modo lista (600 píxeles o menos) las notas, guía, manual y consejos se ocultan
  con un flash. Los diálogos abiertos quedan suspendidos hasta ampliar la ventana.
  Los avisos que todavía no se han mostrado no se consumen en modo lista.
- Información → Notas de versión permite consultar cualquier entrada incluida
  hasta la versión instalada. Volver conserva los cambios pendientes de ajustes.
- La lectura comienza arriba cada vez que se abre el historial o cambia la entrada.

## Añadir una actualización

1. Actualizar la versión de manifest, package y package-lock.
2. Añadir una entrada a `src/features/release-notes/releaseCatalog.js` con versión,
   fecha, clave de traducción, nombres de párrafos y bloques de novedades.
3. Escribir esas claves en `src/lang/en.json`, `es.json`, `es_419.json` y `pt_BR.json`.
   La primera entrada de `paragraphs` es la introducción del encabezado.
4. Ejecutar `npm run check`, `npm run test:e2e` y las pruebas de la extensión
   empaquetada descritas en `CHROME_WEB_STORE.md`.

Los tests comprueban que la versión del manifiesto tenga notas y que no falten
textos en ninguno de los cuatro idiomas. El lector ordena las versiones de forma
numérica y no muestra notas de versiones posteriores a la instalada. Existe un
mensaje de respaldo si un entorno de desarrollo simula una versión sin entrada.

## Persistencia

`newdesktabReleaseNotes` guarda únicamente la última versión ofrecida en
`chrome.storage.local`. Web Locks serializa la reclamación entre pestañas del
mismo perfil. Una pestaña oculta o con otro diálogo abierto espera su turno.
Los fallos de escritura no se anuncian como un aviso guardado correctamente.

Este marcador queda fuera de Chrome Sync y de los backups del espacio de trabajo.
Importar un backup, borrar el espacio de trabajo o consultar las notas a mano no
reactiva el aviso. Volver a una versión anterior tampoco lo repite. La preferencia
es independiente de DataSchema, que continúa en 1.

Las notas y sus traducciones se incluyen en el paquete; no se consultan servicios
externos ni se necesitan permisos nuevos.
