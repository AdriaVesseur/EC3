# Verification report

Tested locally on Windows x64 with .NET 8 runtime, .NET SDK 10, Node 24 and Microsoft Edge. No real Assetto Corsa installation was modified.

## Automated checks

Current app 1.3.1 / catalog 1.4.5 verification:

- TypeScript, catalog schema, 31 Node tests, two metadata generator tests and 178 helper checks pass.
- All 22 real integration checks pass, including rejecting stale installation receipts when a package version changes without changing its files.
- All 23 browser scenarios pass (22 in the full run, plus the corrected photo/grid fixture scenario rerun and a passing server clipboard recovery rerun). Coverage includes three-column slots with one or two cards aligned left, photo and keyboard access to package details, separated readiness figures, responsive round badges, filtered ready counts, configured server IP display/copy, legacy host compatibility, Join request selection, timing, sponsors, app updates and failure states.
- Axe and horizontal overflow checks pass at desktop and 390px widths. Reviewed `content-grid-two.png`, `content-grid-one.png`, `readiness-count-1440.png`, `round-badge-1440.png` and mobile captures, in addition to the Servers/timing/sponsors screenshots. Server/timing/sponsor scenes use explicitly intercepted fixtures; production configuration is empty until the owner supplies real data. Clipboard tests stub the browser API and do not change the system clipboard.
- Browser checks use isolated ports 5185/32155; installed app 32145 remains available. The test helper serves the freshly built web resources through its test-only web-root setting. Packaging recompiles the production endpoint.
- A pre-existing nonfatal WindowsBase/WebView2 assembly-resolution warning remains; compilation succeeds. No game content was changed by these tests.

Earlier baseline checks:

- Web: npm install completed, dependency audit reported zero vulnerabilities; TypeScript and production Vite build pass.
- Helper: .NET 8 Windows build, zero errors.
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
