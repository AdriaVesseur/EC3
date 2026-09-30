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
  Pause,
  Package as PackageIcon,
  Play,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Unplug,
  Trophy,
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
import type { ChampionshipResults, Content, Package, Snapshot } from "./types";
type Page =
  | "home"
  | "content"
  | "championship"
  | "results"
  | "downloads"
  | "installation"
  | "settings";
const pages = [
  ["home", "Home", Home],
  ["content", "Content library", Layers],
  ["championship", "Championship", Flag],
  ["results", "Results", Trophy],
  ["downloads", "Downloads", Download],
  ["installation", "Installation", HardDrive],
  ["settings", "Settings", Settings],
] as const;
const getPage = () => {
  const p = location.hash.slice(1).split("?")[0];
  return pages.some((x) => x[0] === p) ? (p as Page) : "home";
};
export default function App() {
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
    [update, setUpdate] = useState<{
      available: boolean;
      version: string;
      url: string;
    } | null>(null);
  const [results, setResults] = useState<ChampionshipResults | null>(null),
    [resultsLoading, setResultsLoading] = useState(false),
    [resultsError, setResultsError] = useState("");
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
  useEffect(() => {
    if (page !== "results" || !connected) return;
    let cancelled = false;
    setResultsLoading(true);
    setResultsError("");
    api<ChampionshipResults>("/results")
      .then((data) => {
        if (!cancelled) setResults(data);
      })
      .catch((e) => {
        if (!cancelled)
          setResultsError(e instanceof Error ? e.message : "Could not load championship results.");
      })
      .finally(() => {
        if (!cancelled) setResultsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, connected]);
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
  const requiredItems = raceIds
    .map((id) => content.find((item) => item.package.id === id))
    .filter((item): item is Content => !!item);
  const pageLabel = page === "content" ? "Content" : pages.find((p) => p[0] === page)?.[1];
  return (
    <div className="app-shell">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="app-navigation">
        <div className="app-navigation-inner">
          <a href="#home" className="brand" aria-label="Eurocup 3 Content Hub home">
            <img src="./images/logo-dark.png" alt="" />
            <span>Content Hub</span>
          </a>
          <span className="brand-divider" aria-hidden="true" />
          <nav className="primary-nav" aria-label="Main navigation">
            {pages.map(([id, label, Icon]) => (
              <a
                key={id}
                href={"#" + id}
                aria-current={page === id ? "page" : undefined}
                className={page === id ? "nav-item selected" : "nav-item"}
                aria-label={label}
              >
                <Icon size={16} aria-hidden="true" />
                <span>{id === "content" ? "Content" : label}</span>
                {id === "downloads" && ongoing.length > 0 && (
                  <span className="nav-count">{ongoing.length}</span>
                )}
              </a>
            ))}
          </nav>
          <a className="install-app-link" href="./helper/Eurocup3-Helper-Setup.exe">
            <Download size={15} aria-hidden="true" />
            Install app
          </a>
        </div>
      </header>
      <div className="main-shell">
        <div className="page-utility" role="region" aria-label="Page utilities">
          <div className="utility-bar">
            <div className="breadcrumbs">
              <span>{page === "home" ? "Driver portal" : "Eurocup 3"}</span>
              <span aria-hidden="true">/</span>
              <strong>{pageLabel}</strong>
            </div>
            <div className="utility-actions">
              <span className={`online-status ${connected ? "online" : "offline"}`}>
                <span className="online-dot" />
                {connected ? "Online" : connecting ? "Connecting" : "Offline"}
              </span>
              <form
                className="global-search"
                role="search"
                onSubmit={(event) => {
                  event.preventDefault();
                  setPage("content");
                  location.hash = "content";
                }}
              >
                <Search size={17} aria-hidden="true" />
                <input
                  aria-label="Search all content"
                  placeholder="Search the content library"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <kbd>↵</kbd>
              </form>
            </div>
          </div>
          {snapshot?.testMode && (
            <div className="global-notice demo-notice">
              <RefreshCw size={15} aria-hidden="true" />
              <span>ISOLATED TEST ENVIRONMENT</span>
              <span>Harmless demo files · not playable championship content</span>
            </div>
          )}
        </div>
        <main id="main" tabIndex={-1}>
          <div className={page === "home" ? "page-heading home-heading" : "page-heading"}>
            <div>
              <p className="eyebrow">
                {page === "home"
                  ? "EUROCUP 3 / ASSETTO CORSA"
                  : "EUROCUP 3 · DRIVER OPERATIONS"}
              </p>
              <h1>
                {page === "home"
                  ? "CONTENT HUB"
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
                  ? "Everything you need to race."
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
            {page === "home" ? (
              <a href="#championship" className="season-stamp">
                <Flag size={18} aria-hidden="true" />
                <span>
                  2026 Season
                  <strong>Build {cat?.manifest.build ?? "—"}</strong>
                </span>
                <ArrowUpRight size={16} aria-hidden="true" />
              </a>
            ) : (
              <div className="build-label">
                <span>CONTENT BUILD</span>
                <strong>
                  {cat?.manifest.build ?? "—"}
                  <i />
                </strong>
              </div>
            )}
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
              <div className="home-command-grid">
                <section className="featured-package" aria-labelledby="core-package-title">
                  <img
                    className="featured-package-image"
                    src="./images/race-action.jpg"
                    alt="Eurocup 3 cars racing through a corner at Portimão"
                    fetchPriority="high"
                  />
                  <div className="featured-package-shade" />
                  <div className="featured-package-label">
                    <PackageIcon size={17} aria-hidden="true" />
                    <span>EUROCUP 3 CORE PACKAGE</span>
                    {cat?.manifest.demo && <span className="demo-chip">Demo catalog</span>}
                  </div>
                  <div className="featured-package-copy">
                    <h2 id="core-package-title">
                      ONE GRID.<br />ONE COMPLETE<br />SETUP.
                    </h2>
                    <p>Your car, circuits and every race essential.</p>
                    <div className="featured-package-actions">
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
                        <Download size={17} aria-hidden="true" />
                        {allReady ? "Check for updates" : "Download everything"}
                      </Button>
                      <a href="#content" className="featured-view-link">
                        View packages <ArrowUpRight size={16} aria-hidden="true" />
                      </a>
                    </div>
                  </div>
                  <div className="featured-package-foot">
                    <span>{ready?.total ?? requiredItems.length} required packages</span>
                    <span>2026 / COMPETITION CONTENT</span>
                  </div>
                </section>
                <section
                  className={`race-ready-card ${allReady ? "is-ready" : ""}`}
                  aria-labelledby="race-title"
                >
                  <div className="race-ready-heading">
                    <div>
                      <Flag size={19} aria-hidden="true" />
                      <h2 id="race-title">Race Ready</h2>
                    </div>
                    <Badge
                      state={
                        allReady ? "ready" : connected ? "outdated" : "offline"
                      }
                    >
                      {allReady
                        ? "Ready"
                        : !connected
                          ? "Helper offline"
                          : ongoing.length
                            ? "In progress"
                            : !cat
                              ? "Catalog unavailable"
                              : "Missing content"}
                    </Badge>
                  </div>
                  <div className="race-ready-summary">
                    <strong className="race-ready-count">
                      {ready?.readyCount ?? "—"}
                      <span>/ {ready?.total || "—"}</span>
                    </strong>
                    <p>
                      Required packages installed
                      <span>
                        {allReady
                          ? "Every required package is verified and ready."
                          : `${Math.max(0, (ready?.total ?? requiredItems.length) - (ready?.readyCount ?? 0))} packages left to complete your setup.`}
                      </span>
                    </p>
                  </div>
                  <Progress
                    value={
                      ready?.total
                        ? ((ready.readyCount ?? 0) / ready.total) * 100
                        : 0
                    }
                    label="Required content confirmed"
                  />
                  <div className="race-ready-list">
                    {requiredItems.slice(0, 5).map((item) => (
                      <button
                        key={item.package.id}
                        onClick={() => select(item.package)}
                        aria-label={`${item.package.name} v${item.package.version}`}
                      >
                        <span className={item.state === "ready" ? "ready-check checked" : "ready-check"}>
                          {item.state === "ready" && <Check size={14} aria-hidden="true" />}
                        </span>
                        <span className="ready-item-name">{item.package.name}</span>
                        <span className="ready-item-version">v{item.package.version}</span>
                        <ChevronRight size={15} aria-hidden="true" />
                      </button>
                    ))}
                    {!requiredItems.length && (
                      <p className="race-ready-empty">
                        {connected
                          ? "Refresh the catalog to see required packages."
                          : "Connect the helper to check your race setup."}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="primary"
                    className="race-ready-download"
                    disabled={!canAct || ongoing.length > 0}
                    onClick={() =>
                      run(
                        "/update",
                        { ids: raceIds },
                        "Championship preparation started.",
                      )
                    }
                  >
                    <Download size={17} aria-hidden="true" />
                    {allReady ? "Check for updates" : "Download missing content"}
                  </Button>
                  <Button
                    className="race-ready-verify"
                    disabled={!canAct || ongoing.length > 0}
                    onClick={() =>
                      run(
                        "/verify",
                        { ids: raceIds },
                        "Checking championship files.",
                      )
                    }
                  >
                    <ShieldCheck size={15} aria-hidden="true" />
                    Verify all packages
                  </Button>
                  <small className="action-hint">
                    {snapshot?.assettoPath
                      ? "Based on files verified by your local helper."
                      : "Choose your Assetto Corsa folder in Installation."}
                  </small>
                </section>
              </div>
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
              <section className="latest-content" aria-labelledby="latest-content-title">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">AVAILABLE FOR YOUR GRID</span>
                    <h2 id="latest-content-title">Latest content updates</h2>
                  </div>
                  <a href="#content">
                    All packages <ArrowUpRight size={15} aria-hidden="true" />
                  </a>
                </div>
                <div className="latest-content-list">
                  {content.slice(0, 3).map((item) => (
                    <article className="latest-content-item" key={item.package.id}>
                      <span className="latest-content-icon">
                        <TypeIcon type={item.package.type} />
                      </span>
                      <div className="latest-content-info">
                        <span className="latest-content-type">
                          {item.package.type} · {item.package.required ? "Required" : "Optional"}
                        </span>
                        <h3>{item.package.name}</h3>
                        <span className="latest-content-version">Version <strong>{item.package.version}</strong></span>
                      </div>
                      <Badge state={connected ? item.state : "offline"} />
                      <button
                        className="latest-content-open"
                        onClick={() => select(item.package)}
                        aria-label={`View details for ${item.package.name}`}
                      >
                        Details <ArrowUpRight size={15} aria-hidden="true" />
                      </button>
                    </article>
                  ))}
                  {!content.length && (
                    <EmptyState title="No catalog loaded">
                      Connect the helper and refresh the catalog to see available packages.
                    </EmptyState>
                  )}
                </div>
              </section>
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
          {page === "results" && (
            <>
              <section className="settings-section results-source-card">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">LIVE FROM MAKROBEASTS</p>
                    <h2>Championship results</h2>
                  </div>
                  <Button
                    disabled={!connected || resultsLoading}
                    onClick={async () => {
                      setResultsLoading(true);
                      setResultsError("");
                      try {
                        setResults(await api<ChampionshipResults>("/results?refresh=true"));
                      } catch (e) {
                        setResultsError(e instanceof Error ? e.message : "Could not refresh results.");
                      } finally {
                        setResultsLoading(false);
                      }
                    }}
                  >
                    <RefreshCw size={15} className={resultsLoading ? "spin" : undefined} />
                    Refresh results
                  </Button>
                </div>
                <p>
                  Driver standings and race podiums are loaded from the official
                  championship page.
                </p>
                {results?.sourceUrl && (
                  <a className="text-link results-source-link" href={results.sourceUrl} target="_blank" rel="noreferrer">
                    Open MakroBeasts championship <ExternalLink size={14} />
                  </a>
                )}
                {results?.updatedAt && (
                  <p className="results-updated">
                    Updated {new Date(results.updatedAt).toLocaleString()}
                  </p>
                )}
              </section>
              {resultsError && (
                <div className="global-notice error-notice" role="alert">
                  <AlertTriangle size={16} />
                  <span>{resultsError}</span>
                </div>
              )}
              {!resultsLoading && !resultsError && results && (
                <>
                  <section className="results-section">
                    <div className="section-heading">
                      <div>
                        <p className="eyebrow">CHAMPIONSHIP TABLE</p>
                        <h2>Driver standings</h2>
                      </div>
                      <span className="eyebrow">{results.standings.length} DRIVERS</span>
                    </div>
                    {results.standings.length ? (
                      <div className="results-table-wrap">
                        <table className="results-table">
                          <thead><tr><th>Pos</th><th>#</th><th>Driver</th><th>Points</th></tr></thead>
                          <tbody>
                            {results.standings.map((row) => (
                              <tr key={`${row.position}-${row.driver}`}>
                                <td><span className={row.position <= 3 ? `standing-position p${row.position}` : "standing-position"}>{row.position.toString().padStart(2, "0")}</span></td>
                                <td className="driver-number">{row.number}</td>
                                <td className="driver-name">{row.driver}</td>
                                <td className="driver-points">{row.points}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : <EmptyState title="No standings published">MakroBeasts has not published the driver classification yet.</EmptyState>}
                  </section>
                  <section className="results-section">
                    <div className="section-heading">
                      <div>
                        <p className="eyebrow">OFFICIAL RACE PODIUMS</p>
                        <h2>Race podiums</h2>
                      </div>
                      <span className="eyebrow">{results.races.length} ROUNDS</span>
                    </div>
                    {results.races.length ? (
                      <div className="race-results-list">
                        {results.races.map((race) => (
                          <article className="race-result-card" key={race.id}>
                            <div className="race-result-heading">
                              <span className="round-number">{race.round.replace("R", "").padStart(2, "0")}</span>
                              <div>
                                <span className="eyebrow">{race.round} · {race.sessions.map((session) => session.name).join(" / ")}</span>
                                <h3>{race.name}</h3>
                                {race.venue && <p>{race.venue}</p>}
                              </div>
                              <a className="text-link" href={race.url} target="_blank" rel="noreferrer" aria-label={`Open ${race.name} results on MakroBeasts`}>
                                Official page <ExternalLink size={14} />
                              </a>
                            </div>
                            {race.sessions.map((session) => (
                              <div className="podium-list" key={session.name}>
                                {session.results.map((entry) => (
                                  <div className={`podium-row podium-${entry.position}`} key={`${entry.position}-${entry.driver}`}>
                                    <span className="podium-place">{entry.position}</span>
                                    <span className="driver-number">{entry.number}</span>
                                    <strong>{entry.driver}</strong>
                                    <span className="podium-time">{entry.time}</span>
                                  </div>
                                ))}
                              </div>
                            ))}
                          </article>
                        ))}
                      </div>
                    ) : <EmptyState title="No race podiums published">Race podiums will appear here after MakroBeasts publishes them.</EmptyState>}
                  </section>
                </>
              )}
              {resultsLoading && <EmptyState title="Loading official results">Connecting to MakroBeasts…</EmptyState>}
              {!connected && <EmptyState title="Connect the desktop helper">The helper loads and caches championship results for this app.</EmptyState>}
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
                    <dd>1.2.0</dd>
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
