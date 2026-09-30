# Verification report

Tested locally on Windows x64 with .NET 8 runtime, .NET SDK 10, Node 24 and Microsoft Edge. No real Assetto Corsa installation was modified.

## Automated checks

- Web: npm install completed, dependency audit reported zero vulnerabilities; TypeScript and production Vite build pass.
- Helper: .NET 8 Windows build, zero warnings and zero errors.
- 13 catalog tests: valid fixtures, semver, dependency ordering/cycles, unknown dependencies, Windows paths, duplicate IDs/files, folder overlaps, checksums and untrusted URLs.
- 40 C# checks: SHA256 reference vector, Steam VDF parsing, game marker detection, semver including prereleases/build metadata, path validation, Zip Slip, symlinks, case collisions, unexpected files and interrupted installation recovery.
- 21 real integration checks: authentication/origin rejection, corrupt and truncated downloads, hostile redirects, pause/resume/cancel/retry, dependency installation, no redundant downloads, changed-version updates, corruption detection, failed repair state, repair, malicious archive rollback and temporary-file cleanup.
- Browser: real web→helper→download→install→verify→repair flow, filters, package details, Escape/focus behavior, all six sections, disconnected state and the production web served by the helper. Automated axe checks on desktop, mobile, details and section pages.
- Visual captures: 1920×1080, 1440×900, 1366×768 and 390×844. Horizontal overflow assertions pass. Screenshots retained in `artifacts/`.

## Review findings addressed

1. Serialize filesystem replacement while retaining parallel downloads; this prevents one failed transaction from rolling back another in-flight commit.
2. Preserve pre-existing unmanaged content if a process stops before its initial backup rename.
3. Invalidate readiness before repair and on operation failure; an earlier successful verification must not mask a later failure.
4. Snapshot job progress before collecting content state; mutable job objects previously allowed a completed job to accompany older content data in a response.
5. Remove full file inventories from two-second status polling. Fetch inventories only when package details are opened.
6. Handle semantic-version build metadata containing hyphens.
7. Exclude collapsed mobile navigation from the keyboard/accessibility tree and provide a close control.
8. Fix skipped heading levels in the Downloads and empty-state views.
9. Run this project's preview on a distinct port after detecting another application on 5173.
10. Synchronize browser corruption tests with the actual completion of Update All, so the test cannot accidentally corrupt a file while that update is still repairing it.

## Scope and remaining release work

The safe fixtures prove the installer pipeline, not the quality, licensing or server compatibility of official mods. The browser tests use loopback HTTP; external HTTPS hosting and browser local-network permission policies need validation on the selected production domain. No live GitHub release was created, and the generated installer is unsigned. CSP detection is conservative and blocks unknown versions when required. Repair downloads a whole package, pause is in-session only, queued transfers are not persisted across restart, and backups have no automatic retention policy.

Checks do not establish a security certification. The threat model excludes malicious processes already running under the same Windows account, disk hardware failure and compromise of the configured publishing repository. Instructions for signing and rollout are in README.md.
