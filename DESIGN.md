# EC3 design system

Operational desktop software for championship drivers. Fixed navigation, one dominant preparation action, concise package rows and persistent connection state. The initial skill search suggested a landing page; that pattern was rejected. The narrower UI/UX Pro Max search returned data-dense operational dashboards, which informed the library and status displays.

Use Transducer for interface text, with Transducer Condensed for motorsport display typography and Transducer Extended for selected emphasis. The supplied JTD font files are bundled locally under the user-confirmed application license. Graphite surfaces, white type and EC3 red establish the visual identity; green and amber communicate named status, always accompanied by text. The mark is a typographic project treatment, not a supplied official logo.

Page geometry and responsive composition remain in `src/styles.css`. The visual finish lives in `src/appearance.css`, imported last. Keep navigation, section order, columns and container widths unchanged when refining appearance.

Core palette: carbon `#111214`, graphite `#191b20`, raised controls `#23262d`, measured edges `#34373f`, EC3 crimson `#cf2d40`, near-white `#f2f3f6`. The same `--ec3-*` tokens drive named success, warning and error states. Light falls subtly from above: panel inset highlights, darker inner paths/search fields, precise neutral edges and restrained control shadows. Container radii are 9–12px, controls 6px and status tags 4px.

Use only bundled Transducer weights: 400 for body copy, 500 for interface labels, 700 for emphasis, and 900 for the homepage display. Condensed figures carry readiness, builds and round numbers. Race titles and driver names use the regular-width family for legibility; points and times use tabular figures. Long classifications have faint alternate rows and subtle medal emphasis for the first three positions, with points aligned right.

Components: Button, Badge/Status, Progress/DownloadProgress, ContentRow, native dialog Modal, Toast, Navigation, EmptyState, Alert. Shared state comes from the helper; React owns only navigation, filters, open details and feedback. No installation state in browser storage.

Keyboard focus is explicit. Native dialogs trap focus and close with Escape. Reduced-motion is respected. Mobile adapts the top navigation and stacks content row controls. Primary controls explain unavailable states. Real bytes and checked-file counts drive progress; extraction and atomic replacement use named phases without fabricated percentages.

Skills applied: `ui-ux-pro-max`, `ux-designer`, `web-interface-guidelines`, and browser test guidance from `playwright-cli`. Landing-page, hosted Sites, image-generation and Word/PDF skills were evaluated but do not fit this local installer project.

The appearance refinement also applies `frontend-design` and `redesign-existing-projects`: preserve the operational layout, use the championship's typography and red identity, and review every screen with real data as well as keyboard, contrast and responsive checks.
