# Eurocup 3 content catalog

This folder contains the content catalog inside the unified `AdriaVesseur/EC3` repository. The root CI workflow validates both JSON files, versions, safe paths, release URLs, checksums, duplicate identifiers and dependencies.

The checked-in catalog is an **example only**. Its release URLs are examples and have not been published. Its file inventories correspond to harmless demonstration text packages, not playable Assetto Corsa mods. Replace URLs, sizes, hashes and inventories with your official assets before setting `demo` to false.

Upload large ZIP files to GitHub Releases. Commit only manifests, metadata and documentation here. ZIP entries are relative to the package's dedicated install folder. Every file must appear in `files`, with its SHA256 and size. No symlinks, parent paths, Windows reserved names or overlapping package directories are accepted.

The trusted repository is `AdriaVesseur/EC3`. Release URLs must point to assets attached to releases in this repository.

`manifest.json` defines packages. `championship.json` defines mandatory content and event bundles; publish both in the same commit with a matching build. Dependencies use exact package IDs and minimum semantic versions. Events resolve the same dependencies as individual installs.

See the root README for packaging, publishing, helper configuration and release signing instructions.
