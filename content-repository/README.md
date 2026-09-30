# Eurocup 3 content catalog

This folder contains the content catalog inside the unified `AdriaVesseur/EC3` repository. The root CI workflow validates both JSON files, versions, safe paths, release URLs, checksums, duplicate identifiers and dependencies.

The checked-in catalog contains just one car (`ec3-dallara-326`) and one circuit (`barcelona`) as starter entries. It is still an **example only**: its release URLs, sizes, hashes and file inventories describe harmless demonstration text packages, not playable Assetto Corsa mods. Do not only replace `download` with the new URL; the ZIP size, SHA256 and every entry in `files` must describe that exact ZIP or installation and version checks will fail. Generate the metadata from the final package with `node scripts/create-package.mjs <package-folder> <output.zip>`, then copy `size`, `sha256` and `files` from the adjacent `.metadata.json` into the matching manifest entry. Set `download` to the exact GitHub release asset URL. Keep `demo: true` until both entries point to real official assets.

Upload large ZIP files to GitHub Releases. Commit only manifests, metadata and documentation here. ZIP entries are relative to the package's dedicated install folder. Every file must appear in `files`, with its SHA256 and size. No symlinks, parent paths, Windows reserved names or overlapping package directories are accepted.

The trusted repository is `AdriaVesseur/EC3`. Release URLs must point to assets attached to releases in this repository.

`manifest.json` defines packages. `championship.json` defines mandatory content and event bundles; publish both in the same commit with a matching build. Dependencies use exact package IDs and minimum semantic versions. Events resolve the same dependencies as individual installs.

See the root README for packaging, publishing, helper configuration and release signing instructions.
