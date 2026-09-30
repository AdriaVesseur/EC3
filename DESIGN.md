# EC3 design system

Operational desktop software for championship drivers. Fixed navigation, one dominant preparation action, concise package rows and persistent connection state. The initial skill search suggested a landing page; that pattern was rejected. The narrower UI/UX Pro Max search returned data-dense operational dashboards, which informed the library and status displays.

Use Transducer for interface text, with Transducer Condensed for motorsport display typography and Transducer Extended for selected emphasis. The supplied JTD font files are bundled locally under the user-confirmed application license. Graphite surfaces, white type and EC3 red establish the visual identity; green and amber communicate named status, always accompanied by text. Use the existing EC3 logo consistently in the interface, native Windows application and favicon.

Page geometry and responsive composition remain in `src/styles.css`. The visual finish lives in `src/appearance.css`, imported last. Keep navigation, section order, columns and container widths unchanged when refining appearance.

Home's right-hand overview panel previews the first five drivers by championship position from the same source used by Championship. Display real points, the update time and a link to full standings. Loading, missing source, offline and empty results have explicit states. Championship leads with the driver classification; preparation actions stay with the content and readiness controls on Home.

Core palette: carbon `#111214`, graphite `#191b20`, raised controls `#23262d`, measured edges `#34373f`, EC3 crimson `#cf2d40`, near-white `#f2f3f6`. The same `--ec3-*` tokens drive named success, warning and error states. Light falls subtly from above: panel inset highlights, darker inner paths/search fields, precise neutral edges and restrained control shadows. Container radii are 9–12px, controls 6px and status tags 4px.

Use only bundled Transducer weights: 400 for body copy, 500 for interface labels and headings, and 700 for selective numerical emphasis. Do not use the Black face for UI titles. Every route uses the same regular-width page title, eyebrow, subtitle and season/build block. Section headings share a 20px scale; event and race names share an 18px scale, with matching smaller scales on mobile. The image banner uses Condensed Medium, as do readiness, builds and round numbers. Driver names use the regular-width family for legibility; points and times use tabular figures. Long classifications have faint alternate rows and subtle medal emphasis for the first three positions, with points aligned right. Buttons use Medium in sentence case across every page.

Components: Button, Badge/Status, Progress/DownloadProgress, ContentCard, native dialog Modal, Toast, Navigation, EmptyState, Alert, ServersPage, SponsorsFooter and AppUpdateNotice. Shared state comes from the helper; React owns only navigation, filters, open details and feedback. No installation state in browser storage.

Content uses one to three photo cards per row with the same title, category, metadata and action scales. The optional manifest `image` supplies the photo and `icon` supplies its small logo. Missing images fall back to a category illustration. The header shows only the EC3 logo alongside navigation. Servers shares the page heading and panel tokens; server status comes from AC `/INFO`, while live timing comes from the configured HTTPS provider. Embedded timing is opt-in and always has an external link. Sponsors form a quiet logo strip below the footer on every page. Empty configuration adds no fictitious branding.

App releases have a separate version and installer from content packages. The app checks for stable published app releases, labels check failures explicitly and offers an installer download when a newer version exists. Dismissal applies to a version for the current browser session. It does not imply an automatic installation.

Keyboard focus is explicit. Native dialogs trap focus and close with Escape. Reduced-motion is respected. Mobile adapts the top navigation and stacks content row controls. Primary controls explain unavailable states. Real bytes and checked-file counts drive progress; extraction and atomic replacement use named phases without fabricated percentages.

Skills applied: `ui-ux-pro-max`, `ux-designer`, `web-interface-guidelines`, and browser test guidance from `playwright-cli`. Landing-page, hosted Sites, image-generation and Word/PDF skills were evaluated but do not fit this local installer project.

The appearance refinement also applies `frontend-design` and `redesign-existing-projects`: preserve the operational layout, use the championship's typography and red identity, and review every screen with real data as well as keyboard, contrast and responsive checks.
