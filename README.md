# MKBT y Epic Simracing Content Manager

Dos versiones paralelas de una aplicación React + helper Windows .NET 8 para distribuir, instalar, actualizar y verificar contenido de Assetto Corsa. MKBT es la versión predeterminada; Epic Simracing se prepara como compilación independiente. El navegador nunca escribe en la carpeta del juego: todas las operaciones pasan por el helper local.

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

## Carreras MKBT

La sección **Races** reúne las rondas del [calendario global de MKBT](https://www.makrobeasts.com/championships/calendar) y sus [eventos especiales](https://www.makrobeasts.com/events). Muestra portadas oficiales en tarjetas o una vista compacta de calendario. Permite filtrar próximas, todas o disputadas, buscar por campeonato/coche/circuito, elegir competición, ordenar y guardar series favoritas en este dispositivo. Incluye fecha, requisitos y plazas publicadas. Los horarios con fecha ISO se muestran en `Europe/Madrid`; las fechas que MKBT solo publica como texto se conservan tal cual.

Al pulsar una carrera se abre una ficha con **Overview**, **Participants**, **Standings** y **Results**. Muestra la lista pública completa de inscritos (indicando si pertenece al campeonato o al evento), equipos, puntos y rondas publicadas. Los resultados completos de la ronda elegida se cargan al abrir Results, incluyen las sesiones publicadas y mantienen estados como DSQ/DNF; si fallan, se conserva el podio identificado como vista previa y el enlace oficial. El helper ofrece `GET /api/races/{id}/details` y `GET /api/races/{id}/results/{resultId}`, con `?refresh=true` y caché de cinco minutos. Solo acepta identificadores del calendario y fuentes públicas de MKBT.

**Sign up on MKBT** abre la ficha oficial en el navegador para iniciar sesión, revisar requisitos e inscribirse. La app no guarda credenciales de MKBT ni confirma inscripciones por su cuenta. Los datos de plazas corresponden al campeonato cuando la carrera es una ronda. El helper expone `GET /api/races` y `?refresh=true`, con caché de cinco minutos y avisos si una fuente no se puede actualizar.

## Clasificaciones y resultados de MKBT

En la versión MKBT, **Standings** y **Results** muestran los campeonatos activos en tarjetas como las de **Races**, con portadas oficiales, categoría, plazas, rondas y próxima fecha cuando están publicados. Al pulsar una tarjeta se abre una ficha con **Overview**, **Standings** y **Results**. Overview reúne la descripción, formato, licencia, calendario e inscritos completos con buscador. La ficha conserva una altura estable durante la carga y puede cerrarse con Escape para volver a las tarjetas. La última competición consultada alimenta el Top 5 de Home; abrir estas secciones siempre muestra primero las tarjetas. Los campeonatos finalizados quedan fuera de la lista. Cada lista y sección tiene su propio control de actualización y estados explícitos de carga, error y datos no publicados.

Cada ronda mantiene el podio de sus carreras visible. **Top 20**, debajo de cada podio, descarga la clasificación completa de esa ronda al abrirla y muestra hasta veinte pilotos; Carrera 1 y Carrera 2 comparten fila cuando hay espacio. La caché se separa por campeonato y descarta respuestas de selecciones anteriores. Epic mantiene el campeonato configurado en su catálogo. Los endpoints son `GET /api/championships`, `GET /api/championships/{slug}/details`, `GET /api/championships/{slug}/results` y `GET /api/championships/{slug}/results/{eventId}`, con `?refresh=true` para forzar la consulta.

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

El helper muestra la interfaz dentro de una ventana de Windows mediante WebView2 y sirve sus recursos localmente en `http://127.0.0.1:32145` para MKBT y `http://127.0.0.1:32148` para Epic; el usuario no tiene que abrir un navegador. La ventana se puede ocultar en la bandeja y volver a abrir desde el icono de su aplicación; desde allí también se pueden consultar los logs o salir. La misma interfaz puede alojarse por separado en GitHub Pages con un origen aprobado explícitamente en el helper.

Cada marca utiliza sus recursos de `public/brands/mkbt` o `public/brands/epic` en la cabecera, el EXE, la ventana, la bandeja, el instalador y el favicon. El icono correspondiente se incluye como recurso embebido para las publicaciones single-file. `scripts/generate-app-icon.py` conserva la generación del icono legado para compatibilidad.

## Configuración de producción

La configuración local está en `%LOCALAPPDATA%/MKBT/ContentManager/settings.json` o `%LOCALAPPDATA%/EpicSimracing/ContentManager/settings.json`. Si todavía no existe, el primer arranque puede importar los ajustes anteriores de `%LOCALAPPDATA%/Eurocup3/settings.json`; sin ajustes anteriores se usan los valores predeterminados. Crea el archivo de la marca o distribuye los valores adecuados en `ConfigService.cs` antes de publicar. Ejemplo para MKBT; en Epic el origen local utiliza el puerto `32148`:

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

Edita `content-repository/servers.json` para añadir `ip` (dirección IPv4 o IPv6 literal, sin URL ni puerto), `httpPort` (puerto HTTP de AC, normalmente `8081`), nombre y URL opcional del live timing. El campo antiguo `host` sigue siendo compatible, pero debes configurar exactamente uno de `ip` o `host`. **Servers** consulta `/INFO`; antes de unirte puedes elegir un coche permitido que ya tengas instalado, y **Join server** usa esa elección y el puerto de carrera del servidor para abrir Assetto Corsa directamente en la sesión. Content Manager debe estar instalado para gestionar el protocolo de lanzamiento, pero no hace falta entrar en Direct Connect. Las páginas de cronometraje HTTPS se pueden incrustar con `embedTiming: true`; las URL `.json` muestran tablas de pilotos conectados y desconectados, actualizadas cada 15 segundos. Para APIs JSON por HTTP, usa una IP pública literal.

`content-repository/sponsors.json` contiene nombre, logo HTTPS y web HTTPS de cada sponsor. Sus logos enlazados aparecen al pie de todas las páginas. Ambos JSON empiezan vacíos para que publiques tus datos. Hay ejemplos completos en [portal-config.md](content-repository/portal-config.md); la configuración se consulta cada cinco minutos y Servers refresca el estado cada treinta segundos mientras está visible.

La app comprueba nuevas versiones al conectarse y cada treinta minutos. Una release estable `app-vX.Y.Z` con el instalador de su marca activa el aviso cuando es superior a la versión instalada: `MKBT-Content-Manager-Setup.exe` o `EpicSimracing-Content-Manager-Setup.exe`. Cada aplicación solo ofrece su instalador. La actualización consiste en descargarlo y ejecutarlo; no hay instalación silenciosa automática. Los ZIP de contenido se actualizan por el catálogo y no activan este aviso. [UPDATES.md](UPDATES.md) explica cómo sincronizar versiones y preparar la release borrador en GitHub Actions.

El helper vuelve a consultar el catálogo cada cinco minutos cuando no hay operaciones activas. También hay **Refresh catalog** y **Update all**. Durante una verificación o descarga, los controles de refresco permanecen desactivados. Si una solicitud coincide con una cola ya ocupada, `POST /api/refresh` devuelve `{ catalog, refreshed: false }` y conserva los trabajos; con la cola libre devuelve `{ catalog, refreshed: true }` e inicia la verificación. La actualización automática del arranque espera a que la cola quede libre y no repite indefinidamente un error real. Al actualizar se verifican los archivos existentes y solo se descargan paquetes ausentes, distintos o corruptos. Las reparaciones actuales descargan el ZIP completo; `files` ya proporciona el inventario necesario para futuras actualizaciones por archivo. No hay implementación de deltas binarios.

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

Resultado predeterminado: `release/mkbt/MKBT-Content-Manager-Setup.exe`, instalación por usuario sin administrador, runtime autocontenido, acceso directo y desinstalación. También se escribe `release/mkbt/SHA256SUMS.txt` y se copia el instalador a `public/helper/mkbt/` para la web. Con `-Brand Epic`, los archivos correspondientes se generan en las subcarpetas `epic`; `-Brand All` prepara ambos. El instalador no instala contenido del juego ni configura inicio automático. La desinstalación conserva la configuración local y el contenido gestionado.

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

El navegador de pruebas es Edge, disponible en Windows. `test:e2e` arranca Vite en 5185 y su helper aislado en 32155; las pruebas operan exclusivamente sobre `work/demo`. Las apps instaladas pueden seguir abiertas. Integración usa 32147 y comparte el servidor de fixtures 32146 con E2E: ejecutarlas consecutivamente. El build de pruebas usa `VITE_EC3_API_URL`; el empaquetado compila cada marca con su endpoint normal. Las pruebas de identidad usan Vite en 5191/5192 y API simulada, sin iniciar un helper. Capturas en `artifacts/`: escritorio y móvil, biblioteca, servidores y estados desconectados. Los logs están en la subcarpeta `logs/content-manager.log` del perfil de cada marca, con rotación al superar 5 MB; en modo demo están en `work/demo/logs`.

Referencias de implementación: [ASP.NET Core CORS](https://learn.microsoft.com/en-us/aspnet/core/security/cors?view=aspnetcore-8.0), [GitHub Release assets](https://docs.github.com/en/rest/releases/assets), [enlaces a releases](https://docs.github.com/en/repositories/releasing-projects-on-github/linking-to-releases). Revisión visual y accesibilidad documentadas en `DESIGN.md` y `QA.md`.

## Versiones MKBT y Epic

El mismo código mantiene dos aplicaciones independientes: **MKBT Content Manager** y **Epic Simracing Content Manager**. La versión predeterminada es MKBT; Epic queda preparada en paralelo y no aparece como opción dentro de la app. La marca se elige al compilar, de modo que cabecera, logotipo, icono, título, descargas del instalador y avisos de actualización corresponden a esa aplicación. El catálogo de carreras conserva la atribución a MKBT como proveedor de sus datos.

```powershell
# Publicar los instaladores locales sin abrir ni instalar ninguna app.
./scripts/package-helper.ps1 -Brand MKBT
./scripts/package-helper.ps1 -Brand Epic
./scripts/package-helper.ps1 -Brand All

# Desarrollo de cada interfaz; MKBT también es la opción de npm run dev.
npm run dev -- --mode mkbt
npm run dev -- --mode epic

# Comprobar ambas identidades con APIs simuladas, sin tocar Assetto Corsa.
npx playwright test --config playwright.brands.config.ts
```

Las publicaciones web se separan en `dist/mkbt` y `dist/epic`; los ejecutables, en `artifacts/helper/mkbt/MKBT.ContentManager.exe` y `artifacts/helper/epic/EpicSimracing.ContentManager.exe`. Los instaladores son `release/mkbt/MKBT-Content-Manager-Setup.exe` y `release/epic/EpicSimracing-Content-Manager-Setup.exe`, cada uno con su `SHA256SUMS.txt`.

MKBT utiliza `http://127.0.0.1:32145` y guarda su configuración en `%LOCALAPPDATA%/MKBT/ContentManager`; Epic utiliza el puerto `32148` y `%LOCALAPPDATA%/EpicSimracing/ContentManager`. Cada versión tiene su propia instalación, identidad de Windows, perfil WebView2, caché de clasificaciones, favoritos y avisos descartados. En el primer arranque puede importar la configuración anterior de `%LOCALAPPDATA%/Eurocup3` si todavía no existe la nueva; no sustituye ajustes de una versión ya configurada. Los archivos de contenido y recibos existentes de Assetto Corsa se conservan. Las operaciones de instalación y recuperación sobre una misma carpeta del juego se coordinan entre aplicaciones.
