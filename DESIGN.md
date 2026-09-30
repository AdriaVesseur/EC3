# EC3 design system

Operational desktop software for championship drivers. Fixed navigation, one dominant preparation action, concise package rows and persistent connection state. The initial skill search suggested a landing page; that pattern was rejected. The narrower UI/UX Pro Max search returned data-dense operational dashboards, which informed the library and status displays.

Use Transducer for interface text, with Transducer Condensed for motorsport display typography and Transducer Extended for selected emphasis. The supplied JTD font files are bundled locally under the user-confirmed application license. Graphite surfaces, white type and EC3 red establish the visual identity; green and amber communicate named status, always accompanied by text. The mark is a typographic project treatment, not a supplied official logo.

Tokens in `src/styles.css`: `--ec3-bg`, `--ec3-surface`, `--ec3-surface-raised`, `--ec3-border`, `--ec3-primary`, `--ec3-secondary`, `--ec3-text`, `--ec3-muted`, `--ec3-success`, `--ec3-warning`, `--ec3-error`.

Components: Button, Badge/Status, Progress/DownloadProgress, ContentRow, native dialog Modal, Toast, Navigation, EmptyState, Alert. Shared state comes from the helper; React owns only navigation, filters, open details and feedback. No installation state in browser storage.

Keyboard focus is explicit. Native dialogs trap focus and close with Escape. Reduced-motion is respected. Mobile collapses the sidebar and stacks content row controls. Primary controls explain unavailable states. Real bytes and checked-file counts drive progress; extraction and atomic replacement use named phases without fabricated percentages.

Skills applied: `ui-ux-pro-max`, `ux-designer`, `web-interface-guidelines`, and browser test guidance from `playwright-cli`. Landing-page, hosted Sites, image-generation and Word/PDF skills were evaluated but do not fit this local installer project.
