# Eurocup 3 Content Manager

Aplicación funcional React + helper Windows .NET 8 para distribuir, instalar, actualizar y verificar contenido de Assetto Corsa. El navegador nunca escribe en la carpeta del juego: todas las operaciones pasan por el helper local.

**Estado de contenido:** el repositorio público `AdriaVesseur/EC3` contiene la aplicación, el helper, el catálogo y ZIP de prueba publicados por el usuario, incluido Paul Ricard. El catálogo sigue marcado como ejemplo (`demo: true`). La demostración de desarrollo usa archivos de texto locales y una instalación ficticia; no emplearla para preparar una carrera real.

## Ejecutar la demostración

Requisitos de desarrollo: Windows x64, Node 22+ y SDK .NET 8 o superior. El instalador final es autocontenido e incluye el runtime .NET; Windows debe tener Microsoft Edge WebView2 Runtime para mostrar la interfaz de escritorio.

```powershell
npm install
npm run build
npm run helper:build
```

En una terminal:

```powershell
npm run demo
```

En otra:

```powershell
npm run dev
```

Abrir http://127.0.0.1:5183. El modo demo usa `work/demo/assettocorsa`, que contiene un marcador de texto llamado `acs.exe`; nunca se ejecuta. Pulsa **Make me race ready** para descargar, verificar e instalar cinco ZIP de texto reales. Puedes editar un `ec3-demo.txt`, pulsar **Verify files** y después **Repair**. La interfaz señala permanentemente el entorno aislado.

El puerto 5183 evita colisionar con otro proyecto que ya utilizaba 5173 en el entorno de desarrollo. El helper usa 32145 y el servidor de fixtures 32146. No ejecutar simultáneamente demo, integración y otro helper que use esos puertos.

## Arquitectura

```
React / TypeScript / Vite / Tailwind / Lucide
        | sesión efímera + origen permitido
        v
127.0.0.1:32145 · ASP.NET Core · bandeja de Windows
        |                              |
        v                              v
GitHub Raw                       GitHub Releases
manifest.json                    ZIP assets
generated/<id>-<version>.json   automatic size + SHA256 inventory
championship.json                      |
        |                              v
        +--> catálogo validado --> staging --> verificación --> reemplazo
                                                      |
                                      Assetto Corsa/.ec3/installed
                                      Assetto Corsa/.ec3/backups
```

`helper/` contiene servicios separados de configuración, detección, manifiestos, descarga, extracción, instalación, hashing y estado/cola. `Program.cs` configura la API local y el refresco cada cinco minutos. `src/` contiene la aplicación. `content-repository/` contiene el manifiesto, el calendario, los esquemas y los índices técnicos que GitHub Actions genera a partir de las releases. `scripts/` incluye validación y pruebas. No hay estado de instalación en localStorage ni progreso simulado.

El helper muestra la interfaz dentro de una ventana de Windows mediante WebView2 y sirve sus recursos localmente en `http://127.0.0.1:32145`; el usuario no tiene que abrir un navegador. La ventana se puede ocultar en la bandeja y volver a abrir desde el icono de EC3; desde allí también se pueden consultar los logs o salir. La misma interfaz puede alojarse por separado en GitHub Pages con un origen aprobado explícitamente en el helper.

El logo existente de EC3 se usa en el EXE, la ventana, la bandeja, el instalador y el favicon. El icono se incluye como recurso embebido para las publicaciones single-file. Si cambia el logo PNG, `python scripts/generate-app-icon.py` (Python con Pillow) regenera ambos archivos ICO.

## Configuración de producción

La configuración local está en `%LOCALAPPDATA%/Eurocup3/settings.json`. Si no existe se usan los valores predeterminados. Crea ese archivo o distribuye los valores adecuados en `ConfigService.cs` antes de publicar:

```json
{
  "contentRepository": "AdriaVesseur/EC3",
  "manifestUrl": "https://raw.githubusercontent.com/AdriaVesseur/EC3/main/content-repository/manifest.json",
  "championshipUrl": "https://raw.githubusercontent.com/AdriaVesseur/EC3/main/content-repository/championship.json",
  "helperRepository": "AdriaVesseur/EC3",
  "allowedOrigins": [
    "http://127.0.0.1:32145",
    "https://adriavesseur.github.io"
  ],
  "parallelDownloads": 2,
  "assettoPath": null
}
```

Los orígenes no llevan barra final ni ruta. No usar comodines. Reiniciar el helper después de cambiar la configuración. No hay endpoint web para alterar estas opciones de confianza. En desarrollo se permiten los orígenes loopback 5183; eliminarlos de la configuración de distribución si no se necesitan. Los repositorios privados no están soportados mediante tokens incrustados: publicar releases accesibles o añadir un servicio de autorización separado.

El helper busca Steam en el registro de Windows, analiza `steamapps/libraryfolders.vdf` y prueba las bibliotecas habituales. Exige `acs.exe` o `AssettoCorsa.exe`. Si no encuentra el juego, **Select Assetto Corsa folder** abre un selector nativo y guarda la ruta. No es necesario escribir rutas en la web.

## Publicar contenido

Prepara un ZIP que ya contenga las rutas de destino, por ejemplo `content/cars/mi_coche/data.acd` y `content/cars/mi_coche/ui/ui_car.json`. Todos sus archivos deben quedar bajo una sola carpeta de coche o circuito. El instalador extraerá el ZIP desde la carpeta principal de Assetto Corsa.

Publica ese ZIP como asset en una [release de `AdriaVesseur/EC3`](https://github.com/AdriaVesseur/EC3/releases/new). Después edita `content-repository/manifest.json` desde GitHub y rellena únicamente `id`, `name`, `type`, `version`, `required`, `download`, `changelog` y `description`. La acción **Generate content metadata** descarga el ZIP y calcula automáticamente su tamaño, SHA256, carpeta de destino y huellas de los archivos. Espera a que finalice correctamente; luego pulsa **Refresh catalog** en la app.

Al publicar una actualización, aumenta `version` y cambia `download` al asset nuevo. Aumenta también `build` en el manifest y usa el mismo `build` en `content-repository/championship.json`. Para incluir el paquete en el contenido obligatorio de una carrera, añade su ID en `requiredContent` en el calendario. Mantén `demo: true` mientras quede contenido de ejemplo.

Cada paquete admite además `icon`, un campo opcional con la URL HTTPS pública de su logo. Puedes adjuntar la imagen a la release o guardarla en el repo y usar su enlace Raw. La app lo muestra en Content y en los listados de Home; si no hay imagen o falla la carga, conserva el icono de categoría. Consulta [las instrucciones de publicación](content-repository/README.md#logo-de-cada-paquete).

La cuadrícula de **Content** usa también `image`, una URL HTTPS opcional para la foto de fondo de cada tarjeta. Las fotos de ejemplo viven en `content-repository/images/`. Consulta [cómo añadir fotos](content-repository/README.md#foto-de-fondo-de-cada-tarjeta).

## Servidores, sponsors y actualizaciones de la app

Edita `content-repository/servers.json` para añadir `ip` (dirección IPv4 o IPv6 literal, sin URL ni puerto), `httpPort` (puerto HTTP de AC, normalmente `8081`), nombre y URL opcional del live timing. El campo antiguo `host` sigue siendo compatible, pero debes configurar exactamente uno de `ip` o `host`. **Servers** muestra el estado real de `/INFO` y abre Content Manager mediante **Join server**, usando esa IP y su puerto HTTP; no utilices el puerto UDP/TCP de carrera, normalmente `9600`. El protocolo `acmanager` debe estar registrado en Windows. No se inicia una carrera ni se simula cronometraje desde el helper. El timing se abre mediante su enlace o, con `embedTiming: true`, dentro de la app si el proveedor admite iframes.

`content-repository/sponsors.json` contiene nombre, logo HTTPS y web HTTPS de cada sponsor. Sus logos enlazados aparecen al pie de todas las páginas. Ambos JSON empiezan vacíos para que publiques tus datos. Hay ejemplos completos en [portal-config.md](content-repository/portal-config.md); la configuración se consulta cada cinco minutos y Servers refresca el estado cada treinta segundos mientras está visible.

La app comprueba nuevas versiones al conectarse y cada treinta minutos. Una release estable `app-vX.Y.Z` con el asset `Eurocup3-Helper-Setup.exe` activa el aviso cuando es superior a la versión instalada. La actualización consiste en descargar y ejecutar el instalador; no hay instalación silenciosa automática. Los ZIP de contenido se actualizan por el catálogo y no activan este aviso. [UPDATES.md](UPDATES.md) explica cómo sincronizar versiones y preparar la release borrador en GitHub Actions.

El helper vuelve a consultar el catálogo cada cinco minutos cuando no hay operaciones activas. También hay **Refresh catalog** y **Update all**. Al actualizar se verifican los archivos existentes y solo se descargan paquetes ausentes, distintos o corruptos. Las reparaciones actuales descargan el ZIP completo; `files` ya proporciona el inventario necesario para futuras actualizaciones por archivo. No hay implementación de deltas binarios.

## Añadir circuitos y eventos

Para un circuito usa `type: "track"` y rutas como `content/tracks/mi_circuito/...` dentro del ZIP. Los coches usan `type: "car"` y `content/cars/mi_coche/...`. `requiredContent` en el calendario indica qué IDs exige cada evento.

`championship.requiredContent` fija la lista de competición; los paquetes marcados `required` también forman parte del chequeo global. Los eventos se definen como objetos en `championship.events` para obtener una instantánea coherente del build:

```json
{
  "id": "round-04",
  "name": "Round 4",
  "venue": "Barcelona",
  "round": "4",
  "requiredContent": ["mi-circuito"]
}
```

Pueden mantenerse copias editoriales en `events/`, pero el runtime usa `championship.events`; no carga archivos externos arbitrarios. Esta decisión evita combinar versiones incompatibles de varios manifiestos durante una actualización.

La detección de CSP sigue siendo conservadora y lee `extension/config/version.ini` cuando contiene `VERSION=x.y.z`. Algunas distribuciones no exponen esta información: en ese caso se muestra **Not detected** y no se declara compatible. No se ejecutan DLL ni se instala CSP automáticamente.

## Seguridad y fiabilidad

- Bind exclusivo a `127.0.0.1`, validación del encabezado Host, origen exacto, encabezado de cliente y token aleatorio por proceso. El token permanece en memoria de la web. CORS por sí solo no es autenticación.
- Descargas HTTPS únicamente del repositorio de releases configurado. Redirecciones restringidas a hosts de assets de GitHub. Sin credenciales en URLs ni destinos proporcionados por la web.
- El catálogo remoto siempre se valida: versiones, rutas, colisiones, hashes, inventarios y dependencias. Los ID enviados por la web se resuelven contra esa copia validada.
- Rutas relativas sin `..`, ADS de NTFS, dispositivos reservados, barras invertidas, nombres ambiguos ni enlaces/reparse points. Inspección de rutas existentes y rechazo de enlaces en ZIP.
- Tamaño descargado y expandido limitado; inventario exacto, hashes por archivo y comprobación de archivos inesperados. El ZIP se elimina en éxito, fallo y cancelación.
- Descargas paralelas limitadas (1–3, por defecto 2). Reemplazos serializados para evitar carreras de recuperación. Las fases de reemplazo no se cancelan a mitad: se completan o se revierten.
- Journal y backup antes de reemplazar carpetas. Al iniciar o detectar un fallo se restaura la operación incompleta. Las carpetas anteriores permanecen en `.ec3/backups`. No se borran automáticamente los backups: ocupan espacio y deben limpiarse conforme a una política de soporte del campeonato.
- Las carpetas de paquete deben ser dedicadas: el reemplazo retira su contenido anterior completo y lo conserva en backup. No dirigir paquetes a directorios que contengan mods ajenos.

No se promete resistencia a un atacante local que ya pueda modificar simultáneamente la instalación o ejecutar código con la misma cuenta. Tampoco se promete recuperación ante todo fallo físico de disco; el journal cubre las interrupciones de proceso ensayadas. Un catálogo comprometido en el repositorio de confianza sigue siendo un riesgo de cadena de suministro: proteger la rama, exigir revisión y limitar publicadores. Antes de despliegues masivos se recomienda firmar manifiestos con una clave de publicación independiente.

**Race Ready** representa la última verificación del helper para el build actual, requisitos de CSP/helper y ausencia de operaciones pendientes. Se invalida al fallar el catálogo, desconectarse el helper o detectar corrupción. La comprobación explícita previa a la carrera vuelve a leer hashes; no sustituye la comprobación final del servidor de Assetto Corsa ni verifica configuraciones de servidor que no estén en el catálogo.

## Compilar y distribuir Windows

Instalar Inno Setup 6 en la máquina de build. Generar:

```powershell
./scripts/package-helper.ps1
```

Resultado: `release/Eurocup3-Helper-Setup.exe`, instalación por usuario sin administrador, runtime autocontenido, acceso directo y desinstalación. También se escribe `release/SHA256SUMS.txt` y se copia el instalador a `public/helper/` para la web. El instalador no instala contenido del juego ni configura inicio automático. La desinstalación conserva la configuración local y el contenido gestionado.

El binario generado localmente **no está firmado con Authenticode**. Windows puede mostrar una advertencia de editor desconocido. Antes de publicar oficialmente, firmar ejecutable e instalador con el certificado de la organización y regenerar SHA256SUMS. El helper solo detecta nuevas releases: no descarga ni ejecuta un actualizador automáticamente. La futura actualización automática debe comprobar la firma del editor y un manifiesto firmado, no solo un checksum servido junto al binario.

## GitHub y despliegue

El código, el helper, el catálogo y los workflows viven en `https://github.com/AdriaVesseur/EC3`. Los paquetes grandes se adjuntan a Releases del mismo repositorio; no se incluyen mods reales mientras no estén disponibles y autorizados.

```powershell
git remote add origin https://github.com/AdriaVesseur/EC3.git
git add .
git commit -m "Build Eurocup 3 content manager"
git push -u origin main
```

El manifiesto público está en `content-repository/manifest.json` y el calendario en `content-repository/championship.json`. El helper los consulta desde GitHub Raw y solo acepta paquetes adjuntos a Releases de `AdriaVesseur/EC3`.

Workflows incluidos:

- `ci.yml`: typecheck, build, validación, tests de catálogo, helper y navegador Windows.
- `release-helper.yml`: tags `app-v*` / `v*` o ejecución manual con versión; build autocontenido e instalador; crea una **release borrador** para revisión.
- `deploy-web.yml`: despliegue manual a GitHub Pages. Incluye el instalador de la última release publicada; falla si aún no hay una release válida.
- `content-repository/.github/workflows/validate.yml`: validación autónoma del repositorio de contenido.

Para cambiar la versión ejecuta `node scripts/set-app-version.mjs X.Y.Z` antes de crear el tag. Configurar GitHub Pages con origen GitHub Actions y añadir el dominio exacto a `allowedOrigins`. Los navegadores pueden pedir permiso de red local o bloquear determinadas combinaciones HTTPS→loopback: usar la interfaz servida por el propio helper como ruta de soporte universal.

## Pruebas y QA

```powershell
npm run typecheck
npm run build
npm test
npm run validate:content
npm run helper:build
npm run helper:test
node scripts/integration.mjs
npm run test:e2e
```

El navegador de pruebas es Edge, disponible en Windows. `test:e2e` arranca Vite en 5185 y su helper aislado en 32155; las pruebas operan exclusivamente sobre `work/demo`. La app instalada en 32145 puede seguir abierta. Integración usa 32147 y comparte el servidor de fixtures 32146 con E2E: ejecutarlas consecutivamente. El build de pruebas usa `VITE_EC3_API_URL`; el script de empaquetado vuelve a compilar con el endpoint normal 32145. Capturas en `artifacts/`: escritorio y móvil, biblioteca, servidores y estados desconectados. Los logs están en `%LOCALAPPDATA%/Eurocup3/logs/content-manager.log`, con rotación al superar 5 MB; en modo demo están en `work/demo/logs`.

Referencias de implementación: [ASP.NET Core CORS](https://learn.microsoft.com/en-us/aspnet/core/security/cors?view=aspnetcore-8.0), [GitHub Release assets](https://docs.github.com/en/rest/releases/assets), [enlaces a releases](https://docs.github.com/en/repositories/releasing-projects-on-github/linking-to-releases). Revisión visual y accesibilidad documentadas en `DESIGN.md` y `QA.md`.
