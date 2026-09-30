# Publicar coches y circuitos

El catálogo está en `manifest.json`. Los ZIP se suben a Releases del repo `AdriaVesseur/EC3`. En cada paquete editas estos ocho campos: `id`, `name`, `type`, `version`, `required`, `download`, `changelog` y `description`. Puedes añadir `icon` para el logo pequeño e `image` para la foto de fondo de la tarjeta.

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

## Logo de cada paquete

Sube una imagen PNG, WebP, JPG o SVG a la misma release que el ZIP y copia su enlace directo. Añade el campo opcional `icon` dentro de ese paquete en el manifest, junto a `description`:

```json
"icon": "https://github.com/AdriaVesseur/EC3/releases/download/v1.0.0/mi-coche.png"
```

Usa la URL real de tu imagen publicada; no el enlace a la página de la release. También puedes subir imágenes pequeñas a `content-repository/icons/` en el repo y usar su enlace **Raw**, por ejemplo `https://raw.githubusercontent.com/AdriaVesseur/EC3/main/content-repository/icons/mi-coche.png`. El enlace debe ser público, HTTPS y sin credenciales. Una imagen cuadrada con fondo transparente funciona bien; 128 × 128 píxeles es suficiente.

El logo aparece junto al nombre en **Content** y en los listados de **Home**. Si omites `icon` o no se puede cargar la imagen, aparece el icono habitual de coche, circuito, configuración o app. No necesitas cambiar la versión ni volver a subir el ZIP para añadir un logo: guarda el manifest y pulsa **Refresh catalog**. El logo es una imagen de la interfaz; no se instala como archivo del juego.

## Foto de fondo de cada tarjeta

Content muestra una cuadrícula de paquetes. Sube tu foto a `content-repository/images/` o como asset de una release y añade su URL pública HTTPS en `image`:

```json
"image": "https://raw.githubusercontent.com/AdriaVesseur/EC3/main/content-repository/images/mi-coche.jpg"
```

Usa el enlace **Raw** o el enlace directo al archivo, no a su página en GitHub. Se recomienda una foto horizontal de al menos 960 × 540 píxeles. La app la recorta visualmente para cubrir el fondo; el archivo original permanece intacto. Si no hay foto o falla la carga, aparece el icono de la categoría. `image` es opcional, no cambia el ZIP ni sus metadatos y no exige cambiar la versión del paquete.

## Servidores y sponsors

Rellena `servers.json` para configurar servidores y sus enlaces de live timing, y `sponsors.json` para los logos y webs que aparecen al pie de todas las páginas. Ambos empiezan con una lista vacía. Consulta [los ejemplos y los campos](portal-config.md).

## Resultados y clasificación

`championship.json` incluye `resultsUrl`, que apunta a la página pública del campeonato en MakroBeasts. La app lee de ahí la clasificación de pilotos y los podios publicados por ronda. Al abrir **Results**, la app actualiza los datos y los conserva en caché durante cinco minutos. Cuando se publique Eurocup 3 en MakroBeasts, cambia este campo por la URL pública de ese campeonato.

**Home** muestra los cinco primeros pilotos de esa misma clasificación, ordenados por posición, con sus puntos y un enlace a la tabla completa de **Championship**. **Results** sigue mostrando los resultados de las carreras.

El aviso «Example catalog» depende únicamente de `demo` en `content-repository/manifest.json`: `true` lo muestra y `false` lo oculta. No afecta a las descargas ni a la verificación de los coches, y no requiere volver a publicar los ZIP. Este indicador es independiente de usar temporalmente Porsche Cup como fuente de clasificación.

La entrada `ec3-car-template` es un ejemplo con URL `REPLACE-ME`; no aparece en el catálogo de la app hasta que sustituyas el enlace por una release real y la acción genere su índice.
