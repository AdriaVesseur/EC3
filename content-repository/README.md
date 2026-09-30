# Publicar coches y circuitos

El catálogo está en `manifest.json`. Los ZIP se suben a Releases del repo `AdriaVesseur/EC3`. En cada paquete solo editas estos ocho campos: `id`, `name`, `type`, `version`, `required`, `download`, `changelog` y `description`.

## Formato del ZIP

Incluye las rutas completas desde la carpeta de Assetto Corsa, para que el ZIP indique automáticamente el destino. Por ejemplo:

```text
content/cars/mi_coche/data.acd
content/cars/mi_coche/ui/ui_car.json
content/cars/mi_coche/skins/default/...
```

El instalador extrae esos archivos bajo la carpeta de Assetto Corsa. Todos los archivos del juego deben pertenecer a una única carpeta de coche, circuito, app o configuración, y esa carpeta debe concordar con `type`. No añadas una carpeta contenedora como `mi_coche-v1/` por encima de `content/`. Puede haber un `ReadMe.txt`, `ReadMe.md`, `License.txt`, `License.md` o `Changelog.txt` suelto en la raíz; se instalará dentro de la carpeta del coche o circuito. Otros archivos sueltos se rechazan.

## Publicación

1. Crea un ZIP que conserve las rutas completas anteriores.
2. En GitHub, abre **Releases → Draft a new release**, adjunta el ZIP en **Attach binaries** y publica la release.
3. Copia el enlace directo del `.zip` publicado. Debe incluir `/releases/download/`.
4. Edita `content-repository/manifest.json` en GitHub. Copia el paquete de ejemplo y rellena únicamente:

   - `id`: identificador único, minúsculas y guiones; mantenlo estable entre actualizaciones.
   - `name`: nombre que aparecerá en la app.
   - `type`: `car`, `track`, `app` o `config`.
   - `version`: versión del paquete, como `1.0.0`; aumenta al publicar una actualización.
   - `required`: `true` si debe contarse como obligatorio para tener el campeonato listo.
   - `download`: enlace directo al ZIP de la release.
   - `changelog`: lista de cambios.
   - `description`: descripción visible en la app.

5. Guarda el cambio en `main`. La acción **Generate content metadata** descargará el ZIP, leerá las rutas, calculará el tamaño y los SHA256, y guardará el índice técnico en `content-repository/generated/`. Espera a que esa acción termine correctamente antes de pulsar **Refresh catalog** en la app.

El índice generado contiene el destino de instalación y las huellas de cada archivo; no tienes que editarlo. Al publicar una actualización, cambia `version` y `download`. También aumenta `build` en `manifest.json` y pon el mismo valor en `championship.json`. Si el contenido es obligatorio para una ronda concreta, añade su ID a `requiredContent` en ese archivo. Mantén `demo: true` mientras el catálogo incluya ejemplos.

La carpeta de contenido guarda el manifest, el calendario y los índices técnicos pequeños. Los ZIP grandes van en Releases. GitHub Actions valida los cambios; localmente puedes ejecutar `npm run validate:content`.

La entrada `ec3-car-template` es un ejemplo con URL `REPLACE-ME`; no aparece en el catálogo de la app hasta que sustituyas el enlace por una release real y la acción genere su índice.
