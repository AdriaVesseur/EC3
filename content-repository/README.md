# Publicar coches y circuitos

El catálogo de la app está en `manifest.json`; los ZIP se suben a Releases del mismo repo (`AdriaVesseur/EC3`). La app solo descarga paquetes que estén descritos en el manifiesto.

## Flujo manual

1. Prepara el ZIP final. Sus archivos deben estar dentro de la carpeta propia del coche o circuito, no bajo un prefijo `content/cars/<id>/` o `content/tracks/<id>/`. Por ejemplo, dentro de un ZIP de coche deben aparecer `data.acd`, `ui/`, `skins/`, etc. Si recibes un ZIP con rutas completas de Assetto Corsa, extráelo y usa como paquete la carpeta interna del coche o circuito.
2. Desde la carpeta local del repositorio, crea el ZIP compatible y el archivo de metadata:

   ```powershell
   node scripts/create-package.mjs C:/staging/coche C:/staging/coche-1.0.0.zip
   ```

   El comando genera `coche-1.0.0.zip.metadata.json`. Guarda el ZIP generado: será el que subas a GitHub. El metadata contiene `size` (del ZIP), `sha256` (del ZIP) y `files` (ruta, tamaño y SHA256 de cada archivo). No rellenes esos valores a mano ni uses los de otro ZIP.
3. En GitHub, abre **Releases → Draft a new release**, elige una etiqueta y título, y adjunta el ZIP generado en **Attach binaries**. Publica la release. Copia el enlace directo del archivo `.zip`; debe incluir `/releases/download/`, no `/releases/tag/`.
4. Abre `content-repository/manifest.json` en el repo, pulsa el lápiz y edita el JSON tú mismo. Para un paquete nuevo, copia una entrada del mismo tipo; para actualizar uno existente, edita la entrada que ya tiene ese `id`. Rellena:

   - `id`: identificador estable en minúsculas, con guiones.
   - `name`, `version` y `description`: datos que verá el usuario. Usa versión semántica, por ejemplo `1.0.0`.
   - `installPath`: carpeta de Assetto Corsa, por ejemplo `content/cars/mi_coche` o `content/tracks/mi_circuito`.
   - `download`: enlace directo que copiaste del ZIP en la release.
   - `size`, `sha256` y `files`: copia estos campos del `.metadata.json` generado para ese ZIP.
   - `required`: `true` si el paquete debe estar instalado para correr.

5. Aumenta `build` en `manifest.json` y pon exactamente el mismo valor en `championship.json`. Si debe formar parte del campeonato, agrega su ID a `requiredContent` y al evento correspondiente. Mantén `demo: true` mientras quede algún paquete de demostración.
6. Guarda los cambios en `main`. GitHub Actions valida el catálogo; también puedes validarlo localmente con `npm run validate:content`. Luego pulsa **Refresh catalog** en la app.

La carpeta de contenido solo guarda los JSON, esquemas y documentación; los ZIP grandes van en Releases. GitHub limita a 25 MiB los archivos subidos al repo desde el navegador, mientras que Releases admite assets individuales de hasta 2 GiB.

## Estado actual

El catálogo tiene el Dallara 326 EC3 publicado y Barcelona como paquete de demostración. `manifest.json` define los paquetes; `championship.json` define el contenido requerido y los eventos.
