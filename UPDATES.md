# Updating the Windows app

## Guía rápida para publicar una actualización

1. Cambia la app y ejecuta `node scripts/set-app-version.mjs 1.6.0` (o tu nueva versión).
2. Guarda esos cambios en GitHub. En **Actions → Release Windows app → Run workflow**, introduce esa misma versión.
3. El workflow compila MKBT y Epic por separado y prepara una release **borrador** con ambos instaladores y sus checksums. Prueba los instaladores y revisa las notas antes de publicar la release estable.
4. Al publicarla, quienes tengan una versión anterior verán un aviso al abrir su app o en su siguiente comprobación automática (cada treinta minutos). MKBT descarga el instalador MKBT y Epic descarga el instalador Epic; el usuario lo ejecuta para actualizar esa aplicación.

Los ZIP de coches y circuitos siguen su propio manifest. No hace falta publicar una versión nueva de la app para cambiar contenido, fotos, servidores o sponsors. La instalación totalmente automática sería un desarrollo adicional; el flujo actual avisa y permite descargar.

The app checks for a newer Windows installer when it connects and every 30 minutes while connected. Settings also offers a manual check. A successful check is cached by the local helper for 10 minutes. Repeated checks during that period reuse the recorded result and check time.

When a newer app version is available, the notice shows the installed and published versions, release notes, a link to the release, and **Download update**. The button opens the published installer asset over HTTPS. Download the file, close the running app when ready, and run the installer to replace the app in the same per-user location. Open the updated app from its shortcut and confirm its version in Settings. Dismissing the notice applies to that version for the current browser/app session; a later version gets its own notice.

Installation is manual. The app does not run the downloaded installer, stop the app, or claim that downloading a file installed an update. The endpoint reports `automaticInstall: false`. The published checksum file can be checked manually; the current notice does not download or verify the installer itself.

## App versions and content versions

For upgrades from an older app, use that launcher's tray icon → **Exit helper** before running its installer; the window's X button hides it in the tray. Windows installer shutdown requests can close the app normally, while the X button still hides it.

App releases and championship content share a repository but have separate versions:

- **App:** use `app-vX.Y.Z`, for example `app-v1.6.0`, with `MKBT-Content-Manager-Setup.exe` for MKBT and/or `EpicSimracing-Content-Manager-Setup.exe` for Epic. A launcher only considers a release containing its own exact installer name. Existing `vX.Y.Z` tags are accepted with that same matching-asset requirement.
- **Content:** package versions and the catalog build remain in `content-repository`. Car, track, app, and extension package releases do not trigger a Windows app update unless they also meet the app release rules above.

The helper lists repository releases through GitHub REST, pages through the results, ignores drafts and prereleases, and selects the highest stable semantic **app** version for its brand. It does not use `/releases/latest`, because the repository's latest release could contain championship content. It validates that the installer and release links point to the configured GitHub repository over HTTPS. MKBT and Epic keep independent update-dismissal state and native installation identities, so updating one does not replace the other.

With no matching published app release, the response explicitly reports `published: false`, `available: false`, `version: currentVersion`, and null release/download links. A network error, invalid response, timeout, pagination limit, or GitHub refusal is a failed check, not evidence that the installed app is current. The helper respects GitHub retry/rate-limit headers, uses conditional requests when an ETag is available, and backs off after failures. It scans up to 20 pages of 100 releases; reaching that limit fails explicitly instead of guessing.

GitHub documents the release list fields and pagination in [List releases](https://docs.github.com/en/rest/releases/releases#list-releases), and conditional requests and rate-limit handling in [REST API best practices](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api).

## Prepare an app release in GitHub Actions

1. Synchronize the app versions locally, for example:

   ```powershell
   node scripts/set-app-version.mjs 1.6.0
   ```

   This updates `package.json`, its lockfile, the helper project, `Program.Version`, and the installer version. Both brands share the source version. Commit the app changes and version files together, and push the intended source revision.

2. In GitHub, open **Actions → Release Windows app → Run workflow**. Select the branch containing those changes and enter `1.6.0`. The workflow validates the input against the checked-out project and prepares `app-v1.6.0` as a **draft** release. Alternatively, push a matching app tag:

   ```powershell
   git tag app-v1.6.0
   git push origin app-v1.6.0
   ```

3. The workflow runs the tests and builds each self-contained Windows installer in a separate matrix job. Each Actions artifact contains that brand's installer and `SHA256SUMS.txt`. The draft-release job collects both installers and writes one combined `SHA256SUMS.txt`, with a line for each unique installer name, before uploading those three assets to the draft. It does not publish the draft. Re-running the workflow can replace assets in an existing draft; it refuses to replace assets in a published release.

4. Download and test the installer from the draft/Actions artifact. Review the release notes, version, installation and upgrade behavior. Complete the signing/review step below, replace the draft assets with their final versions, then manually publish the stable release. Only published, non-prerelease app releases appear in update checks.

## Build and install manually

On Windows with Node.js, .NET 8 SDK, and Inno Setup 6 installed:

```powershell
node scripts/set-app-version.mjs 1.6.0
npm ci
npm test
npm run helper:test
./scripts/package-helper.ps1 -Brand MKBT
# Other available targets:
./scripts/package-helper.ps1 -Brand Epic
./scripts/package-helper.ps1 -Brand All
```

MKBT is the default target when `-Brand` is omitted. The script writes `release/mkbt/MKBT-Content-Manager-Setup.exe` and/or `release/epic/EpicSimracing-Content-Manager-Setup.exe`; each folder includes its own `SHA256SUMS.txt`. It builds without installing or opening either app. MKBT installs under `%LOCALAPPDATA%/Programs/MKBT Content Manager`, and Epic under `%LOCALAPPDATA%/Programs/Epic Simracing Content Manager`. Their shortcuts, profiles, app identities and local helper ports are separate. Only MKBT is exposed by the default web build and web deployment; Epic remains a separate build without an in-app selector.

You can run either installer locally without creating or publishing a GitHub release. To distribute both builds, upload the two installers and a combined checksum file to a draft release with a matching `app-v1.6.0` tag, review/sign them, and publish manually. A newer installer on disk or an unpublished draft alone does not cause an update notice.

## Signing and any future automatic updater

The workflow prepares an unsigned draft for review; it does not contain signing credentials. Before distributing signed installers, sign each final executable with the project's Windows code-signing certificate and timestamp configuration, then verify each using `signtool verify /pa /v <installer-path>`. Recompute both checksums after signing:

```powershell
$mkbtInstaller = 'release/mkbt/MKBT-Content-Manager-Setup.exe'
$epicInstaller = 'release/epic/EpicSimracing-Content-Manager-Setup.exe'
$mkbtHash = (Get-FileHash -LiteralPath $mkbtInstaller -Algorithm SHA256).Hash.ToLowerInvariant()
$epicHash = (Get-FileHash -LiteralPath $epicInstaller -Algorithm SHA256).Hash.ToLowerInvariant()
Set-Content -LiteralPath release/mkbt/SHA256SUMS.txt -Value "$mkbtHash  MKBT-Content-Manager-Setup.exe"
Set-Content -LiteralPath release/epic/SHA256SUMS.txt -Value "$epicHash  EpicSimracing-Content-Manager-Setup.exe"
Set-Content -LiteralPath release/SHA256SUMS.txt -Value @(
  "$mkbtHash  MKBT-Content-Manager-Setup.exe"
  "$epicHash  EpicSimracing-Content-Manager-Setup.exe"
)
```

Upload the final signed installer and its matching checksum to the draft, review them, and publish it. The current app does not automatically check a publisher signature.

An automatic updater would be a separate implementation: verify the downloaded installer hash and trusted publisher signature, require a ready queue and an explicit installation action, hand off to a separate updater process, close the app safely, run the installer with its documented options, restart, and verify the installed version with a recoverable failure path. None of those installation steps is implemented by the notification flow.
