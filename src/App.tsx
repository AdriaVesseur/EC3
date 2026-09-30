import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  Download,
  Flag,
  FolderOpen,
  HardDrive,
  Home,
  Layers,
  LoaderCircle,
  Menu,
  Pause,
  Play,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Unplug,
  X,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import { api, connect, bytes, active } from "./api";
import {
  Badge,
  Button,
  ContentRow,
  EmptyState,
  Modal,
  Progress,
  TypeIcon,
} from "./components";
import type { Content, Package, Snapshot } from "./types";
type Page =
  | "home"
  | "content"
  | "championship"
  | "downloads"
  | "installation"
  | "settings";
const pages = [
  ["home", "Overview", Home],
  ["content", "Content library", Layers],
  ["championship", "Championship", Flag],
  ["downloads", "Downloads", Download],
  ["installation", "Installation", HardDrive],
  ["settings", "Settings", Settings],
] as const;
const getPage = () => {
  const p = location.hash.slice(1).split("?")[0];
  return pages.some((x) => x[0] === p) ? (p as Page) : "home";
};
export default function App() {
  const [narrow, setNarrow] = useState(
    () => matchMedia("(max-width:700px)").matches,
  );
  useEffect(() => {
    const media = matchMedia("(max-width:700px)");
    const change = () => setNarrow(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  const [page, setPage] = useState<Page>(getPage),
    [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [connected, setConnected] = useState(false),
    [connecting, setConnecting] = useState(true),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [selected, setSelected] = useState<Package | null>(null),
    [detailTab, setDetailTab] = useState("overview"),
    [mobile, setMobile] = useState(false),
    [update, setUpdate] = useState<{
      available: boolean;
      version: string;
      url: string;
    } | null>(null);
  const poll = useCallback(async () => {
    const data = await api<Snapshot>("/status");
    setSnapshot(data);
    setConnected(true);
    return data;
  }, []);
  const reconnect = useCallback(async () => {
    setConnecting(true);
    try {
      await connect();
      await poll();
      setError("");
    } catch {
      setConnected(false);
    } finally {
      setConnecting(false);
    }
  }, [poll]);
  useEffect(() => {
    void reconnect();
    const h = () => {
      setPage(getPage());
      setMobile(false);
    };
    addEventListener("hashchange", h);
    return () => removeEventListener("hashchange", h);
  }, [reconnect]);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      try {
        await poll();
      } catch {
        if (!cancelled) setConnected(false);
        if (!cancelled) {
          try {
            await connect();
            await poll();
          } catch {
            /* Retry on the next heartbeat. */
          }
        }
      }
      if (!cancelled) timer = setTimeout(tick, 2000);
    }
    timer = setTimeout(tick, 2000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [poll]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(t);
  }, [toast]);
  async function run(path: string, body: unknown = {}, message = "") {
    setPending(true);
    setError("");
    try {
      await api(path, body);
      await poll();
      if (message) setToast(message);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Operation failed. Please retry.",
      );
    } finally {
      setPending(false);
    }
  }
  async function refresh() {
    await run(
      "/refresh",
      {},
      "Catalog refreshed. File verification is running.",
    );
  }
  useEffect(() => {
    if (
      connected &&
      snapshot &&
      !snapshot.catalog &&
      !pending &&
      !snapshot.catalogError
    )
      void refresh();
  }, [connected, snapshot?.catalog]);
  const content = snapshot?.content ?? [],
    jobs = snapshot?.jobs ?? [],
    ongoing = jobs.filter((j) => active(j.state)),
    ready = snapshot?.raceReady,
    cat = snapshot?.catalog,
    canAct = connected && !!snapshot?.assettoPath && !!cat && !pending,
    allReady = connected && !!ready?.ready && !pending;
  const library = content.filter(
    (s) =>
      (filter === "all" || s.package.type === filter) &&
      s.package.name.toLowerCase().includes(query.toLowerCase()),
  );
  const action = (item: Content) =>
    run(
      "/" +
        (item.state === "ready"
          ? "verify"
          : item.state === "corrupted"
            ? "repair"
            : item.state === "outdated"
              ? "update"
              : "install"),
      { ids: [item.package.id] },
      "Operation added to Downloads.",
    );
  const select = (p: Package) => {
    setSelected(p);
    setDetailTab("overview");
    void api<Package>(`/packages/${encodeURIComponent(p.id)}`)
      .then((detail) =>
        setSelected((current) => (current?.id === p.id ? detail : current)),
      )
      .catch((e) => setError((e as Error).message));
  };
  const raceIds = [
    ...new Set([
      ...(cat?.championship.requiredContent ?? []),
      ...content.filter((s) => s.package.required).map((s) => s.package.id),
    ]),
  ];
  return (
    <div className="app-shell">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <aside
        inert={narrow && !mobile}
        className={mobile ? "sidebar open" : "sidebar"}
      >
        {mobile && (
          <Button
            className="close-navigation"
            aria-label="Close navigation"
            onClick={() => setMobile(false)}
          >
            <X size={18} />
          </Button>
        )}
        <a href="#home" className="brand" aria-label="Eurocup 3 overview">
          <span className="brand-top">
            EUROCUP<span>3</span>
            <i />
          </span>
          <span className="brand-caption">CONTENT MANAGER</span>
        </a>
        <div className="workspace-label">
          DRIVER WORKSPACE <span>2026</span>
        </div>
        <nav aria-label="Main navigation">
          {pages.map(([id, label, Icon]) => (
            <a
              key={id}
              href={"#" + id}
              aria-current={page === id ? "page" : undefined}
              className={page === id ? "nav-item selected" : "nav-item"}
            >
              <Icon size={19} aria-hidden="true" />
              {label}
              {id === "downloads" && ongoing.length > 0 && (
                <span className="nav-count">{ongoing.length}</span>
              )}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="series-mark">
            <Flag size={22} />
            <span>
              ONE CHAMPIONSHIP.
              <br />
              <strong>EVERY DETAIL.</strong>
            </span>
          </div>
          <div className="helper-status">
            <Badge state={connected ? "ready" : "offline"}>
              {connected
                ? "Helper connected"
                : connecting
                  ? "Connecting…"
                  : "Helper offline"}
            </Badge>
            <span>
              EC3 LOCAL HELPER <b>{snapshot?.version ?? "—"}</b>
            </span>
          </div>
          <div className="sidebar-footer">
            <span>CONTENT MANAGER</span>
            <span>v1.0.0</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div>
            <Button
              className="mobile-menu"
              aria-label="Toggle navigation"
              onClick={() => setMobile(!mobile)}
            >
              <Menu size={20} />
            </Button>
            <span>EUROCUP 3</span>
            <ChevronRight size={14} />
            <strong>{pages.find((p) => p[0] === page)?.[1]}</strong>
          </div>
          <div className="topbar-right">
            <span className="season-dot" />
            2026 SEASON
            <span className="divider" />
            <ShieldCheck size={16} />
            <span>OFFICIAL CONTENT</span>
          </div>
        </header>
        <main id="main" tabIndex={-1}>
          <div className="page-heading">
            <div>
              <p className="eyebrow">EUROCUP 3 · DRIVER OPERATIONS</p>
              <h1>
                {page === "home"
                  ? "Your next race starts here."
                  : page === "content"
                    ? "Content library."
                    : page === "championship"
                      ? "One grid. One standard."
                      : page === "downloads"
                        ? "Download control."
                        : page === "installation"
                          ? "Your race environment."
                          : "Your workspace."}
              </h1>
              <p className="subtitle">
                {page === "home"
                  ? "The right content. The right version. Ready for the grid."
                  : page === "content"
                    ? "Every official package, in one place."
                    : page === "championship"
                      ? "Prepare your championship or install a single event."
                      : page === "downloads"
                        ? "Follow every download, installation and file check."
                        : page === "installation"
                          ? "Assetto Corsa and your local helper, working together."
                          : "Connection, support and application preferences."}
              </p>
            </div>
            <div className="build-label">
              <span>CONTENT BUILD</span>
              <strong>
                {cat?.manifest.build ?? "—"}
                <i />
              </strong>
            </div>
          </div>
          {error && (
            <div className="alert error" role="alert">
              <AlertTriangle size={20} />
              <span>{error}</span>
              <Button onClick={() => setError("")} aria-label="Dismiss error">
                <X size={16} />
              </Button>
            </div>
          )}
          {!connected && (
            <div className="connection-banner">
              <Unplug size={24} />
              <div>
                <strong>
                  {connecting
                    ? "Connecting to your local helper…"
                    : "Connect your race environment"}
                </strong>
                <p>
                  The Windows helper installs and verifies content directly in
                  Assetto Corsa.
                </p>
              </div>
              <Button onClick={reconnect} disabled={connecting}>
                <RefreshCw size={15} />
                {connecting ? "Connecting…" : "Reconnect"}
              </Button>
              <a
                className="button primary"
                href="./helper/Eurocup3-Helper-Setup.exe"
              >
                Install EC3 Helper
                <ArrowUpRight size={16} />
              </a>
            </div>
          )}
          {snapshot?.testMode && (
            <div className="demo-label">
              <span>ISOLATED TEST ENVIRONMENT</span> Real installation flow ·
              harmless demo files · not playable championship content
            </div>
          )}
          {cat?.manifest.demo && !snapshot?.testMode && (
            <div className="alert">
              <AlertTriangle size={18} />
              <span>
                Example catalog. Official release assets have not been
                published.
              </span>
            </div>
          )}
          {page === "home" && (
            <>
              <section
                className={`race-panel ${allReady ? "is-ready" : ""}`}
                aria-labelledby="race-title"
              >
                <div className="race-copy">
                  <div className="race-kicker">
                    <span className="square" />
                    PRE-RACE SYSTEM CHECK <span>01 / READINESS</span>
                  </div>
                  <Badge
                    state={
                      allReady ? "ready" : connected ? "outdated" : "offline"
                    }
                  >
                    {allReady
                      ? "All systems ready"
                      : !connected
                        ? "Helper connection required"
                        : ongoing.length
                          ? "Preparation in progress"
                          : !cat
                            ? "Awaiting catalog"
                            : ready?.reason || "Action required"}
                  </Badge>
                  <h2 id="race-title">
                    RACE
                    <br />
                    <span>READY{allReady ? "." : "?"}</span>
                  </h2>
                  <p>
                    {allReady
                      ? "Your championship content is installed and verified. See you on the grid."
                      : !connected
                        ? "Connect your helper. We’ll take care of the content."
                        : !snapshot?.assettoPath
                          ? "Locate Assetto Corsa to prepare your championship."
                          : "One click to install, update and verify your championship content."}
                  </p>
                  <div className="race-actions">
                    <Button
                      variant="primary"
                      disabled={!canAct || ongoing.length > 0}
                      onClick={() =>
                        run(
                          "/update",
                          { ids: raceIds },
                          "Championship preparation started.",
                        )
                      }
                    >
                      <Download size={18} />
                      {allReady ? "Check for updates" : "Make me race ready"}
                      <ArrowRight size={18} />
                    </Button>
                    <Button
                      disabled={!canAct || ongoing.length > 0}
                      onClick={() =>
                        run(
                          "/verify",
                          { ids: raceIds },
                          "Checking championship files.",
                        )
                      }
                    >
                      <ShieldCheck size={17} />
                      Verify files
                    </Button>
                  </div>
                  <small className="action-hint">
                    {!connected
                      ? "Install and open the helper to enable automatic installation."
                      : !cat
                        ? "Refresh the catalog to load official packages."
                        : !snapshot?.assettoPath
                          ? "Choose your game folder in Installation."
                          : ongoing.length
                            ? "View progress and controls in Downloads."
                            : "Packages are checked with SHA256 before installation."}
                  </small>
                </div>
                <div className="race-visual" aria-hidden="true">
                  <div className="technical-cross top">+</div>
                  <div className="readiness-number">
                    {ready?.readyCount ?? "—"}
                    <span>/ {ready?.total || "—"}</span>
                  </div>
                  <div className="readiness-label">REQUIRED PACKAGES READY</div>
                  <div className="readiness-lines">
                    {Array.from({ length: ready?.total || 8 }, (_, i) => (
                      <span
                        key={i}
                        className={i < (ready?.readyCount ?? 0) ? "filled" : ""}
                      />
                    ))}
                  </div>
                  <div className="big-three">3</div>
                  <span className="visual-label">EC3 / SYSTEM STATUS</span>
                  <div className="technical-cross bottom">+</div>
                </div>
              </section>
              <div className="status-strip">
                {[
                  ["car", "Race car"],
                  ["track", "Circuits"],
                  ["config", "Configurations"],
                  ["app", "Applications"],
                ].map(([type, label]) => {
                  const items = content.filter((s) => s.package.type === type);
                  const n = items.filter((s) => s.state === "ready").length;
                  return (
                    <a href="#content" key={type}>
                      <TypeIcon type={type} />
                      <div>
                        <span>{label}</span>
                        <strong>
                          {items.length
                            ? `${n} / ${items.length} ready`
                            : cat
                              ? "Not required"
                              : "Awaiting catalog"}
                        </strong>
                      </div>
                      <span
                        className={
                          items.length && n === items.length
                            ? "status-tick good"
                            : "status-tick"
                        }
                      >
                        {items.length && n === items.length ? (
                          <Check size={16} />
                        ) : (
                          <span>—</span>
                        )}
                      </span>
                    </a>
                  );
                })}
              </div>
              <div className="overview-grid">
                <section>
                  <div className="section-heading">
                    <div>
                      <span className="eyebrow">YOUR CONTENT</span>
                      <h2>Championship essentials</h2>
                    </div>
                    <a href="#content">
                      View library
                      <ArrowUpRight size={15} />
                    </a>
                  </div>
                  {content.length ? (
                    <div className="compact-list">
                      {content.slice(0, 5).map((s) => (
                        <button
                          onClick={() => select(s.package)}
                          key={s.package.id}
                        >
                          <span className="type-icon">
                            <TypeIcon type={s.package.type} />
                          </span>
                          <span className="compact-name">
                            {s.package.name}
                            <small>
                              v{s.package.version} <b>·</b> {s.package.type}
                            </small>
                          </span>
                          <Badge state={connected ? s.state : "offline"} />
                          <ChevronRight size={16} />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <EmptyState title="Your grid is waiting">
                      {connected
                        ? "Load the championship catalog to see your required packages."
                        : "Connect the helper to load your official content library."}
                      <Button
                        onClick={refresh}
                        disabled={!connected || pending}
                      >
                        Refresh catalog
                      </Button>
                    </EmptyState>
                  )}
                </section>
                <section className="event-panel">
                  <div className="section-heading">
                    <div>
                      <span className="eyebrow">CHAMPIONSHIP</span>
                      <h2>Prepare for the next green light.</h2>
                    </div>
                    <Flag size={23} />
                  </div>
                  <div className="event-art" aria-hidden="true">
                    <div className="track-line" />
                    <span>EC3</span>
                  </div>
                  {cat?.championship.events[0] ? (
                    <>
                      <span className="eyebrow">
                        ROUND {cat.championship.events[0].round} · EVENT PACKAGE
                      </span>
                      <h3>{cat.championship.events[0].venue}</h3>
                      <p>
                        Car, circuit and event configuration. Everything you
                        need, installed together.
                      </p>
                      <Button
                        disabled={!canAct}
                        onClick={() =>
                          run(
                            "/install",
                            { ids: cat.championship.events[0].requiredContent },
                            "Event package added to Downloads.",
                          )
                        }
                      >
                        Prepare event
                        <ArrowRight size={16} />
                      </Button>
                    </>
                  ) : (
                    <>
                      <h3>Every round. In sync.</h3>
                      <p>
                        Event packages will appear here when your championship
                        catalog is connected.
                      </p>
                      <a href="#championship" className="text-link">
                        Explore championship
                        <ArrowRight size={16} />
                      </a>
                    </>
                  )}
                </section>
              </div>
            </>
          )}
          {page === "content" && (
            <>
              <div className="library-toolbar">
                <div className="filter-tabs" aria-label="Content type">
                  {[
                    ["all", "All content"],
                    ["car", "Cars"],
                    ["track", "Circuits"],
                    ["config", "Configs"],
                    ["app", "Apps"],
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      aria-pressed={filter === id}
                      className={filter === id ? "active" : ""}
                      onClick={() => setFilter(id)}
                    >
                      {label}
                      {id === "all" && <span>{content.length}</span>}
                    </button>
                  ))}
                </div>
                <label className="search">
                  <Search size={17} />
                  <input
                    aria-label="Search content"
                    placeholder="Search content…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
              </div>
              <div className="section-heading library-summary">
                <span>
                  {library.length} PACKAGES <b>·</b>{" "}
                  {content.filter((s) => s.state === "ready").length} UP TO DATE
                </span>
                <Button
                  disabled={!canAct || ongoing.length > 0}
                  onClick={() =>
                    run("/update", { ids: [] }, "Updating all packages.")
                  }
                >
                  <Download size={16} />
                  Update all
                </Button>
              </div>
              <div
                className="content-table"
                role="table"
                aria-label="Official content"
              >
                <div className="content-row table-heading" role="row">
                  <span role="columnheader">PACKAGE</span>
                  <span role="columnheader">LATEST VERSION</span>
                  <span role="columnheader">STATUS</span>
                  <span role="columnheader">ACTION</span>
                </div>
                {library.map((s) => (
                  <ContentRow
                    key={s.package.id}
                    item={{ ...s, state: connected ? s.state : "offline" }}
                    disabled={
                      !canAct ||
                      ongoing.some((j) => j.packageId === s.package.id)
                    }
                    onSelect={() => select(s.package)}
                    onAction={() => action(s)}
                  />
                ))}
                {!library.length && (
                  <EmptyState
                    title={query ? "No matching packages" : "No content loaded"}
                  >
                    {query
                      ? "Try a different name or filter."
                      : "Connect the helper and refresh the catalog."}
                  </EmptyState>
                )}
              </div>
              <p className="footnote">
                <ShieldCheck size={15} />
                Packages are installed only in validated Assetto Corsa content
                folders.
              </p>
            </>
          )}
          {page === "downloads" && (
            <>
              <div className="download-summary">
                <span>
                  <strong>{ongoing.length}</strong>ACTIVE / QUEUED
                </span>
                <span>
                  <strong>
                    {jobs.filter((j) => j.state === "complete").length}
                  </strong>
                  COMPLETED
                </span>
                <span>
                  <strong>
                    {jobs.filter((j) => j.state === "failed").length}
                  </strong>
                  NEED ATTENTION
                </span>
              </div>
              {!jobs.length ? (
                <EmptyState title="The queue is clear">
                  Choose a package from Content library or prepare the entire
                  championship.
                  <a href="#content" className="button">
                    Open content library
                    <ArrowRight size={16} />
                  </a>
                </EmptyState>
              ) : (
                <div className="download-list">
                  {[...jobs].reverse().map((j) => (
                    <article key={j.id} className="download-item">
                      <div className="section-heading">
                        <div>
                          <h2>{j.name}</h2>
                          <Badge state={j.state} />
                        </div>
                        <div className="queue-actions">
                          {j.state === "downloading" && (
                            <Button
                              disabled={!connected}
                              onClick={() => run(`/jobs/${j.id}/pause`)}
                            >
                              <Pause size={15} />
                              Pause
                            </Button>
                          )}
                          {j.state === "paused" && (
                            <Button
                              disabled={!connected}
                              onClick={() => run(`/jobs/${j.id}/resume`)}
                            >
                              <Play size={15} />
                              Resume
                            </Button>
                          )}
                          {[
                            "queued",
                            "downloading",
                            "paused",
                            "extracting",
                            "checking",
                          ].includes(j.state) && (
                            <Button
                              disabled={!connected}
                              onClick={() => run(`/jobs/${j.id}/cancel`)}
                            >
                              <X size={15} />
                              Cancel
                            </Button>
                          )}
                          {["failed", "cancelled"].includes(j.state) && (
                            <Button
                              disabled={!connected}
                              onClick={() => run(`/jobs/${j.id}/retry`)}
                            >
                              <RefreshCw size={15} />
                              Retry
                            </Button>
                          )}
                        </div>
                      </div>
                      {j.state === "verifying" ? (
                        <>
                          <Progress
                            value={
                              j.totalFiles
                                ? (j.checkedFiles / j.totalFiles) * 100
                                : 0
                            }
                            label={`Verifying ${j.name}`}
                          />
                          <p className="transfer-stats">
                            Checking files: {j.checkedFiles} / {j.totalFiles}
                          </p>
                        </>
                      ) : (
                        <>
                          <Progress
                            value={j.total ? (j.bytes / j.total) * 100 : 0}
                            label={`Downloading ${j.name}`}
                          />
                          <div className="transfer-stats">
                            <span>
                              {bytes(j.bytes)} / {bytes(j.total)}
                            </span>
                            <span>
                              {j.state === "downloading"
                                ? `${bytes(j.bytesPerSecond)}/s · ${Math.ceil((j.total - j.bytes) / Math.max(1, j.bytesPerSecond))}s remaining`
                                : j.state === "complete"
                                  ? "Operation complete"
                                  : "—"}
                            </span>
                          </div>
                        </>
                      )}
                      {j.error && <p className="job-error">{j.error}</p>}
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
          {page === "championship" && (
            <>
              <section className="settings-section">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">2026 SEASON</p>
                    <h2>Championship readiness</h2>
                  </div>
                  <Badge state={allReady ? "ready" : "outdated"}>
                    {allReady
                      ? "Ready to race"
                      : `${ready?.readyCount ?? 0} / ${ready?.total ?? 0} packages ready`}
                  </Badge>
                </div>
                <p>
                  All required cars, circuits, configurations and dependencies
                  must pass verification.
                </p>
                <Button
                  variant="primary"
                  disabled={!canAct || ongoing.length > 0}
                  onClick={() => run("/update", { ids: raceIds })}
                >
                  Prepare championship
                  <ArrowRight size={16} />
                </Button>
              </section>
              <div className="section-heading">
                <h2>Event packages</h2>
                <span className="eyebrow">
                  {cat?.championship.events.length ?? 0} EVENTS
                </span>
              </div>
              {cat?.championship.events.map((event) => (
                <section className="event-row" key={event.id}>
                  <span className="round-number">
                    {event.round.padStart(2, "0")}
                  </span>
                  <div>
                    <span className="eyebrow">{event.name}</span>
                    <h3>{event.venue}</h3>
                    <p>
                      {event.requiredContent
                        .map(
                          (id) =>
                            content.find((s) => s.package.id === id)?.package
                              .name ?? id,
                        )
                        .join(" · ")}
                    </p>
                  </div>
                  <Button
                    disabled={!canAct}
                    onClick={() =>
                      run(
                        "/install",
                        { ids: event.requiredContent },
                        "Event package queued.",
                      )
                    }
                  >
                    Install event
                    <ArrowUpRight size={16} />
                  </Button>
                </section>
              ))}
              {!cat && (
                <EmptyState title="Championship not loaded">
                  Connect your helper and refresh the official catalog.
                </EmptyState>
              )}
            </>
          )}
          {page === "installation" && (
            <>
              <section className="settings-section">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">GAME DIRECTORY</p>
                    <h2>Assetto Corsa</h2>
                  </div>
                  <Badge
                    state={
                      connected && snapshot?.assettoPath ? "ready" : "missing"
                    }
                  >
                    {connected && snapshot?.assettoPath
                      ? "Detected"
                      : "Not detected"}
                  </Badge>
                </div>
                <p>
                  The helper searches your Steam registry and library folders
                  automatically.
                </p>
                <code className="path-box">
                  {connected
                    ? (snapshot?.assettoPath ??
                      "No installation found. Select the game folder to continue.")
                    : "Connect the helper to detect your installation."}
                </code>
                <div className="button-row">
                  <Button
                    disabled={!connected || pending || ongoing.length > 0}
                    onClick={() =>
                      run(
                        "/select-folder",
                        {},
                        "Installation folder saved. Refresh the catalog to verify your content.",
                      )
                    }
                  >
                    <FolderOpen size={17} />
                    Select Assetto Corsa folder
                  </Button>
                  <Button
                    disabled={!connected || !snapshot?.assettoPath}
                    onClick={() => run("/open-assetto-folder")}
                  >
                    <ExternalLink size={16} />
                    Open folder
                  </Button>
                </div>
              </section>
              <section className="settings-section">
                <div className="section-heading">
                  <h2>Custom Shaders Patch</h2>
                  <Badge state={snapshot?.cspVersion ? "ready" : "unverified"}>
                    {snapshot?.cspVersion ?? "Not detected"}
                  </Badge>
                </div>
                <p>
                  Detected from extension/config/version.ini when available.
                  Unknown versions cannot pass packages with a CSP requirement.
                  External software is never installed automatically.
                </p>
                <a
                  href="https://acstuff.club/patch/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-link"
                >
                  Open CSP installation guide
                  <ArrowUpRight size={16} />
                </a>
              </section>
              <section className="settings-section">
                <h2>Installation protection</h2>
                <div className="protection-list">
                  <span>
                    <ShieldCheck />
                    SHA256 package & file checks
                  </span>
                  <span>
                    <FolderOpen />
                    Confined installation paths
                  </span>
                  <span>
                    <RefreshCw />
                    Recovery backups before replacement
                  </span>
                </div>
                <p>
                  Keep Assetto Corsa closed while updating. Previous package
                  folders are retained in .ec3/backups for recovery.
                </p>
              </section>
            </>
          )}
          {page === "settings" && (
            <>
              <section className="settings-section">
                <div className="section-heading">
                  <h2>Local helper</h2>
                  <Badge state={connected ? "ready" : "offline"} />
                </div>
                <dl className="details-grid">
                  <div>
                    <dt>Connection</dt>
                    <dd>127.0.0.1:32145</dd>
                  </div>
                  <div>
                    <dt>Installed version</dt>
                    <dd>{snapshot?.version ?? "Unavailable"}</dd>
                  </div>
                  <div>
                    <dt>Application version</dt>
                    <dd>1.0.0</dd>
                  </div>
                  <div>
                    <dt>Catalog last refreshed</dt>
                    <dd>
                      {cat
                        ? new Intl.DateTimeFormat(undefined, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          }).format(new Date(cat.fetchedAt))
                        : "Not yet"}
                    </dd>
                  </div>
                </dl>
                <div className="button-row">
                  <Button onClick={reconnect}>Reconnect helper</Button>
                  <Button
                    disabled={!connected || pending}
                    onClick={async () => {
                      setPending(true);
                      try {
                        setUpdate(await api("/helper-update"));
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setPending(false);
                      }
                    }}
                  >
                    Check helper updates
                  </Button>
                </div>
                {update && (
                  <p>
                    {update.available
                      ? `Version ${update.version} is available. `
                      : "You have the latest published helper. "}
                    <a
                      className="text-link"
                      href={update.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View release
                      <ArrowUpRight size={15} />
                    </a>
                  </p>
                )}
              </section>
              <section className="settings-section">
                <h2>Support & diagnostics</h2>
                <p>
                  Download, installation and verification logs are stored
                  locally. Share relevant entries with your championship support
                  team.
                </p>
                <Button disabled={!connected} onClick={() => run("/open-logs")}>
                  <FolderOpen size={16} />
                  Open logs
                </Button>
              </section>
              <section className="settings-section">
                <h2>Catalog source</h2>
                <p>
                  The helper owns the trusted GitHub repository configuration.
                  Remote pages cannot change download sources or installation
                  paths.
                </p>
                <Button
                  onClick={refresh}
                  disabled={!connected || pending || ongoing.length > 0}
                >
                  <RefreshCw size={16} />
                  Refresh catalog
                </Button>
                {snapshot?.catalogError && (
                  <p className="job-error">{snapshot.catalogError}</p>
                )}
              </section>
            </>
          )}
          <footer className="main-footer">
            <span>
              <ShieldCheck size={14} />
              VERIFIED CONTENT. EQUAL COMPETITION.
            </span>
            <button
              onClick={refresh}
              disabled={!connected || pending || ongoing.length > 0}
            >
              <RefreshCw size={13} />
              Refresh catalog
            </button>
            <a href="#settings">
              <CircleHelp size={14} />
              Support & diagnostics
            </a>
          </footer>
        </main>
      </div>
      {pending && (
        <div className="working" role="status">
          <LoaderCircle size={17} className="spin" />
          Working…
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCheck size={18} />
          {toast}
          <button
            onClick={() => setToast("")}
            aria-label="Dismiss notification"
          >
            <X size={16} />
          </button>
        </div>
      )}
      {selected && (
        <Modal title={selected.name} onClose={() => setSelected(null)}>
          <p className="eyebrow">EUROCUP 3 · OFFICIAL CONTENT</p>
          <dl className="details-grid">
            <div>
              <dt>Latest version</dt>
              <dd>{selected.version}</dd>
            </div>
            <div>
              <dt>Installed version</dt>
              <dd>
                {content.find((s) => s.package.id === selected.id)
                  ?.installedVersion ?? "Not installed"}
              </dd>
            </div>
            <div>
              <dt>Package size</dt>
              <dd>{bytes(selected.size)}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <Badge
                  state={
                    connected
                      ? (content.find((s) => s.package.id === selected.id)
                          ?.state ?? "missing")
                      : "offline"
                  }
                />
              </dd>
            </div>
          </dl>
          <div className="filter-tabs detail-tabs">
            {["overview", "changelog", "files"].map((tab) => (
              <button
                key={tab}
                className={detailTab === tab ? "active" : ""}
                aria-pressed={detailTab === tab}
                onClick={() => setDetailTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>
          {detailTab === "overview" ? (
            <div className="detail-content">
              <p>{selected.description}</p>
              <h3>Install location</h3>
              <code>{selected.installPath}</code>
              <h3>Requirements</h3>
              <p>
                {selected.dependencies.length
                  ? selected.dependencies
                      .map((d) => `${d.id} ≥ ${d.minimumVersion}`)
                      .join(", ")
                  : "No additional package dependencies."}
              </p>
              {selected.minimumCspVersion && (
                <p>Custom Shaders Patch ≥ {selected.minimumCspVersion}</p>
              )}
            </div>
          ) : detailTab === "changelog" ? (
            <div className="detail-content">
              {selected.changelog?.length ? (
                selected.changelog.map((line, i) => <p key={i}>{line}</p>)
              ) : (
                <p>No release notes were published for this package.</p>
              )}
            </div>
          ) : (
            <div className="file-list">
              {!selected.files.length && <p>File inventory loading…</p>}
              {selected.files.map((f) => (
                <div key={f.path}>
                  <strong>{f.path}</strong>
                  <span>{bytes(f.size)}</span>
                  <code>{f.sha256}</code>
                </div>
              ))}
            </div>
          )}
          <div className="modal-footer">
            <Button onClick={() => setSelected(null)}>Close</Button>
            <Button
              variant="primary"
              disabled={
                !canAct || ongoing.some((j) => j.packageId === selected.id)
              }
              onClick={() => {
                const item = content.find((s) => s.package.id === selected.id);
                if (item) {
                  void action(item);
                  setSelected(null);
                }
              }}
            >
              {content.find((s) => s.package.id === selected.id)?.state ===
              "ready"
                ? "Verify files"
                : "Install / repair"}
              <ArrowRight size={16} />
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
