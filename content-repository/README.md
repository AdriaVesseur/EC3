# Catálogo de contenido de Eurocup 3

El catálogo vive en este repositorio (`AdriaVesseur/EC3`). La app consulta `manifest.json`; cada paquete apunta a un ZIP de una Release de GitHub. Ahora hay un coche publicado (`ec3-dallara-326`) y Barcelona continúa como ejemplo de demostración.

## Publicar un coche o circuito

1. Extrae el ZIP original. Para un coche, localiza su carpeta, por ejemplo `content/cars/zr_zallara_z320`. El ZIP que distribuirá la app debe tener los archivos del coche directamente en la raíz (`data.acd`, `ui/`, `skins/`, etc.), sin el prefijo `content/cars/zr_zallara_z320/`. Para un circuito usa del mismo modo el contenido interno de `content/tracks/<id>`.
2. En la carpeta local del repo, genera el ZIP compatible y sus hashes:

   ```powershell
   node scripts/create-package.mjs C:/staging/original/content/cars/zr_zallara_z320 C:/staging/zr-zallara-z320-0.2.0.zip
   ```

   Se crea también `zr-zallara-z320-0.2.0.zip.metadata.json`. No edites su tamaño, SHA256 ni inventario `files` a mano.

3. En GitHub, crea una Release en `AdriaVesseur/EC3` y adjunta el ZIP generado. Publica la Release; puedes marcarla como pre-release para distinguirla de una versión del gestor. Copia el enlace directo al asset ZIP, cuya ruta incluye `/releases/download/`.
4. Desde la raíz local del repo, registra el paquete con ese enlace y el archivo de metadata:

   ```powershell
   npm run content:register -- --id zr-zallara-z320 --name "Zallara Z320" --type car --version 0.2.0 --install-path content/cars/zr_zallara_z320 --download "https://github.com/AdriaVesseur/EC3/releases/download/ec3-content-zallara-0.2.0/zr-zallara-z320-0.2.0.zip" --metadata "C:/staging/zr-zallara-z320-0.2.0.zip.metadata.json" --description "Coche EC3 para Assetto Corsa." --required
   ```

   El comando descarga ese enlace y confirma que el ZIP coincide con el `.metadata.json`; después rellena tamaño, SHA256 y `files`, agrega o reemplaza el paquete, aumenta `build` y actualiza el mismo build en `championship.json`. Usa `--optional` en lugar de `--required` si el paquete es opcional.

5. Ejecuta `npm run validate:content`, revisa el cambio, y confirma y sube juntos `manifest.json` y `championship.json` a `main`. La app encontrará el paquete al pulsar **Refresh catalog**. Si debe aparecer en un evento concreto, añade su ID a `championship.events[].requiredContent` antes de validar.

El catálogo valida que la URL pertenezca a una Release de este repo, que los directorios de instalación sean exclusivos y seguros, y que los hashes e inventarios sean válidos. `demo` solo debe cambiar a `false` cuando todos los paquetes sean contenido oficial listo para usar.

## Ficheros del catálogo

- `manifest.json`: paquetes disponibles, versiones, URLs y hashes.
- `championship.json`: contenido obligatorio, eventos y versión mínima del gestor.
- `manifest.schema.json` y `championship.schema.json`: esquemas que CI y el comando de validación aplican.
