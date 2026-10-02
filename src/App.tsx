import { useCallback, useEffect, useState, type CSSProperties } from "react";
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
  Server,
} from "lucide-react";
import { api, connect, bytes, active } from "./api";
import {
  Badge,
  Button,
  EmptyState,
  Modal,
  PackageArtwork,
  Progress,
  TypeIcon,
} from "./components";
import type { ChampionshipResults, Content, Package, Snapshot } from "./types";
import { StandingsPreview } from "./StandingsPreview";
import { ContentCard } from "./ContentCard";
import { ServersPage } from "./ServersPage";
import { SponsorsFooter } from "./SponsorsFooter";
import { usePortal } from "./usePortal";
import { portalErrorMessage } from "./portal-types";
import { resolveTeam, TeamDriver } from "./TeamDriver";
import { AppUpdateNotice, useAppUpdate } from "./AppUpdateNotice";
type Page =
  "home" | "content" | "championship" | "results" | "servers" | "settings";
const pages = [
  ["home", "Home", Home],
  ["content", "Content library", Layers],
  ["championship", "Championship", Flag],
  ["results", "Results", Trophy],
  ["servers", "Servers", Server],
  ["settings", "Settings", Settings],
] as const;
const getPage = () => {
  const p = location.hash.slice(1).split("?")[0];
  if (p === "downloads") return "content";
  if (p === "installation") return "settings";
  return pages.some((x) => x[0] === p) ? (p as Page) : "home";
};
const getContentTab = () =>
  location.hash.slice(1).split("?")[0] === "downloads"
    ? "downloads"
    : "library";

const raceTimeSeconds = (value: string) => {
  const parts = value.split(":").map(Number);
  if (parts.length < 2 || parts.length > 3 || parts.some(Number.isNaN)) {
    return null;
  }
  return parts.length === 3
    ? parts[0] * 3600 + parts[1] * 60 + parts[2]
    : parts[0] * 60 + parts[1];
};

const formatRaceResultTime = (results: { time: string }[], index: number) => {
  const time = results[index]?.time ?? "—";
  if (index === 0) return time;
  const winnerTime = raceTimeSeconds(results[0]?.time ?? "");
  const driverTime = raceTimeSeconds(time);
  if (winnerTime === null || driverTime === null || driverTime < winnerTime) {
    return time;
  }
  const gap = driverTime - winnerTime;
  const seconds = (gap % 60).toFixed(3).padStart(6, "0");
  const formatted =
    gap >= 3600
      ? `${Math.floor(gap / 3600)}:${String(Math.floor(gap / 60) % 60).padStart(2, "0")}:${seconds}`
      : gap >= 60
        ? `${Math.floor(gap / 60)}:${seconds}`
        : gap.toFixed(3);
  return `+${formatted}`;
};

const formatRaceSessionName = (name: string) =>
  name.trim().toLocaleLowerCase() === "carrera" ? "Carrera 1" : name;

export default function App() {
  const isDesktopApp =
    new URLSearchParams(window.location.search).get("desktop") === "1";
  const [page, setPage] = useState<Page>(getPage),
    [contentTab, setContentTab] = useState<"library" | "downloads">(
      getContentTab,
    ),
    [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [connected, setConnected] = useState(false),
    [connecting, setConnecting] = useState(true),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [selected, setSelected] = useState<Package | null>(null),
    [detailTab, setDetailTab] = useState("overview");
  const appUpdate = useAppUpdate(connected);
  const portal = usePortal(connected);
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
      const target = location.hash.slice(1).split("?")[0];
      if (target === "downloads") setContentTab("downloads");
      else if (target === "content") setContentTab("library");
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
  const resultsSource = snapshot?.catalog?.championship.resultsUrl;
  const hasCatalog = !!snapshot?.catalog;
  useEffect(() => {
    if (
      !connected ||
      (page !== "home" && page !== "championship" && page !== "results")
    )
      return;
    if (hasCatalog && !resultsSource) {
      setResults(null);
      setResultsLoading(false);
      setResultsError("");
      return;
    }
    let cancelled = false;
    setResults((previous) =>
      !resultsSource || previous?.sourceUrl === resultsSource ? previous : null,
    );
    setResultsLoading(true);
    setResultsError("");
    api<ChampionshipResults>("/results")
      .then((data) => {
        if (!cancelled) setResults(data);
      })
      .catch((e) => {
        if (!cancelled)
          setResultsError(
            e instanceof Error
              ? e.message
              : "Could not load championship results.",
          );
      })
      .finally(() => {
        if (!cancelled) setResultsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, connected, resultsSource, hasCatalog]);
  const content = snapshot?.content ?? [],
    jobs = snapshot?.jobs ?? [],
    ongoing = jobs.filter((j) => active(j.state)),
    verificationRunning =
      connecting ||
      ongoing.some(
        (job) => job.state === "checking" || job.state === "verifying",
      ),
    ready = snapshot?.raceReady,
    cat = snapshot?.catalog,
    canAct = connected && !!snapshot?.assettoPath && !!cat && !pending;
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
  const requiredCount = ready?.total ?? raceIds.length;
  const hasRequiredPackages = requiredCount > 0;
  const allReady =
    connected && !!ready?.ready && hasRequiredPackages && !pending;
  const requiredItems = raceIds
    .map((id) => content.find((item) => item.package.id === id))
    .filter((item): item is Content => !!item);
  const pageLabel =
    page === "content"
      ? contentTab === "downloads"
        ? "Downloads"
        : "Content"
      : pages.find((p) => p[0] === page)?.[1];
  return (
    <div className="app-shell">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="app-navigation">
        <div className="app-navigation-inner">
          <a href="#home" className="brand" aria-label="Eurocup 3 home">
            <img src="./images/logo-dark.png" alt="" />
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
              </a>
            ))}
          </nav>
          {!isDesktopApp && (
            <a
              className="install-app-link"
              href="./helper/Eurocup3-Helper-Setup.exe"
            >
              <Download size={15} aria-hidden="true" />
              Install app
            </a>
          )}
        </div>
      </header>
      <div className="main-shell">
        <div className="page-utility" role="region" aria-label="Page utilities">
          <div className="utility-bar">
            <div className="breadcrumbs">
              <span>Eurocup 3</span>
              <span aria-hidden="true">/</span>
              <strong>{pageLabel}</strong>
            </div>
            <div className="utility-actions">
              <span
                className={`online-status ${connected ? "online" : "offline"}`}
              >
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
              <span>
                Harmless demo files · not playable championship content
              </span>
            </div>
          )}
        </div>
        <main id="main" tabIndex={-1} aria-label="Eurocup 3 portal">
          <div className="page-heading">
            <div>
              <p className="eyebrow">EUROCUP 3 / ASSETTO CORSA</p>
              <h1>
                {page === "home"
                  ? "Content hub."
                  : page === "content"
                    ? contentTab === "downloads"
                      ? "Downloads."
                      : "Content library."
                    : page === "championship"
                      ? "One grid. One standard."
                      : page === "results"
                        ? "The championship ledger."
                        : page === "servers"
                          ? "Race servers."
                          : "Your workspace."}
              </h1>
              <p className="subtitle">
                {page === "home"
                  ? "Everything you need to race."
                  : page === "content"
                    ? contentTab === "downloads"
                      ? "Track every transfer and file check."
                      : "Every official package, in one place."
                    : page === "championship"
                      ? "Prepare your championship or install a single event."
                      : page === "results"
                        ? "Official race results from MakroBeasts."
                        : page === "servers"
                          ? "Join the grid and follow the session live."
                          : "Connection, support and application preferences."}
              </p>
            </div>
            <div className="build-label">
              <span>
                {cat?.manifest.season ?? "2026"} SEASON · CONTENT BUILD
              </span>
              <strong>
                {cat?.manifest.build ?? "—"}
                <i />
              </strong>
            </div>
          </div>
          <AppUpdateNotice {...appUpdate} />
          {connected &&
            page !== "servers" &&
            (portal.error || !!portal.portal?.errors.length) && (
              <div className="alert" role="status">
                <AlertTriangle size={20} aria-hidden="true" />
                <div>
                  {portal.error && <p>{portal.error}</p>}
                  {portal.portal?.errors.map((problem, index) => (
                    <p key={index}>{portalErrorMessage(problem)}</p>
                  ))}
                </div>
                <Button
                  disabled={portal.loading}
                  onClick={() => void portal.refresh()}
                >
                  Refresh services
                </Button>
              </div>
            )}
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
                <section
                  className="featured-package"
                  aria-labelledby="core-package-title"
                >
                  <img
                    className="featured-package-image"
                    src="./images/home-zallara-barcelona.jpg"
                    alt="Eurocup 3 Zallara Z320 racing at Barcelona"
                    fetchPriority="high"
                  />
                  <div className="featured-package-shade" />
                  <div className="featured-package-label">
                    <PackageIcon size={17} aria-hidden="true" />
                    <span>EUROCUP 3 CORE PACKAGE</span>
                    {cat?.manifest.demo && (
                      <span className="demo-chip">Demo catalog</span>
                    )}
                  </div>
                  <div className="featured-package-copy">
                    <h2 id="core-package-title">
                      ONE GRID.
                      <br />
                      ONE COMPLETE
                      <br />
                      SETUP.
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
                        View packages{" "}
                        <ArrowUpRight size={16} aria-hidden="true" />
                      </a>
                    </div>
                  </div>
                  <div className="featured-package-foot">
                    <span>
                      {!cat
                        ? "Catalog not loaded"
                        : `${requiredCount} required ${requiredCount === 1 ? "package" : "packages"}`}
                    </span>
                    <span>2026 / COMPETITION CONTENT</span>
                  </div>
                </section>
                <section
                  className={`race-ready-card ${allReady && !verificationRunning ? "is-ready" : ""}`}
                  aria-labelledby="race-title"
                >
                  <div className="race-ready-heading">
                    <div>
                      <Flag size={19} aria-hidden="true" />
                      <h2 id="race-title">Race Ready</h2>
                    </div>
                    <Badge
                      state={
                        verificationRunning
                          ? "verifying"
                          : allReady
                            ? "ready"
                            : !connected
                              ? "offline"
                              : !cat || !hasRequiredPackages
                                ? "unverified"
                                : ongoing.length
                                  ? "downloading"
                                  : "outdated"
                      }
                    >
                      {verificationRunning ? (
                        <span role="status" aria-live="polite">
                          <LoaderCircle
                            size={12}
                            className="spin"
                            aria-hidden="true"
                          />
                          Verifying content
                        </span>
                      ) : allReady ? (
                        "Ready"
                      ) : !connected ? (
                        "Helper offline"
                      ) : ongoing.length ? (
                        "In progress"
                      ) : !cat ? (
                        "Catalog unavailable"
                      ) : !hasRequiredPackages ? (
                        "No requirements yet"
                      ) : (
                        "Missing content"
                      )}
                    </Badge>
                  </div>
                  {cat && hasRequiredPackages ? (
                    <>
                      <div className="race-ready-summary">
                        <strong
                          className="race-ready-count"
                          role="img"
                          aria-label={
                            ready?.readyCount == null
                              ? `Verification count unavailable for ${requiredCount} required packages`
                              : `${ready.readyCount} of ${requiredCount} required packages verified`
                          }
                        >
                          <span
                            className="race-ready-current"
                            aria-hidden="true"
                          >
                            {ready?.readyCount ?? "—"}
                          </span>
                          <span
                            className="race-ready-separator"
                            aria-hidden="true"
                          >
                            /
                          </span>
                          <span className="race-ready-total" aria-hidden="true">
                            {requiredCount || "—"}
                          </span>
                        </strong>
                        <p>
                          Required packages installed
                          <span>
                            {allReady
                              ? "Every required package is verified and ready."
                              : ready?.readyCount == null
                                ? "Verify packages to check your setup."
                                : `${Math.max(0, requiredCount - (ready?.readyCount ?? 0))} ${requiredCount - (ready?.readyCount ?? 0) === 1 ? "package" : "packages"} left to complete your setup.`}
                          </span>
                        </p>
                      </div>
                      <Progress
                        value={
                          requiredCount
                            ? ((ready?.readyCount ?? 0) / requiredCount) * 100
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
                            <span
                              className={
                                item.state === "ready"
                                  ? "ready-check checked"
                                  : "ready-check"
                              }
                            >
                              {item.state === "ready" && (
                                <Check size={14} aria-hidden="true" />
                              )}
                            </span>
                            <span className="ready-item-name">
                              {item.package.name}
                            </span>
                            <span className="ready-item-version">
                              v{item.package.version}
                            </span>
                            <ChevronRight size={15} aria-hidden="true" />
                          </button>
                        ))}
                        {!requiredItems.length && (
                          <p className="race-ready-empty">
                            Checking the required package list…
                          </p>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="race-ready-guidance">
                      <strong>
                        {!connected
                          ? "Connect the desktop helper"
                          : !cat
                            ? "Load the championship catalog"
                            : "No required packages are listed yet"}
                      </strong>
                      <p>
                        {!connected
                          ? "The helper checks your game files and manages downloads."
                          : !cat
                            ? "Refresh the catalog to see the cars and circuits needed for race day."
                            : "Browse the content library to see available cars, circuits and tools."}
                      </p>
                    </div>
                  )}
                  <Button
                    variant="primary"
                    className="race-ready-download"
                    disabled={
                      connecting ||
                      pending ||
                      (connected && hasRequiredPackages && ongoing.length > 0)
                    }
                    onClick={() => {
                      if (!connected) return reconnect();
                      if (!cat) return refresh();
                      if (!hasRequiredPackages) {
                        setContentTab("library");
                        setPage("content");
                        location.hash = "content";
                        return;
                      }
                      if (!snapshot?.assettoPath) {
                        setPage("settings");
                        location.hash = "settings";
                        return;
                      }
                      return run(
                        "/update",
                        { ids: raceIds },
                        "Championship preparation started.",
                      );
                    }}
                  >
                    {!connected ? (
                      <RefreshCw size={17} aria-hidden="true" />
                    ) : !cat ? (
                      <RefreshCw size={17} aria-hidden="true" />
                    ) : !hasRequiredPackages ? (
                      <Layers size={17} aria-hidden="true" />
                    ) : !snapshot?.assettoPath ? (
                      <FolderOpen size={17} aria-hidden="true" />
                    ) : (
                      <Download size={17} aria-hidden="true" />
                    )}
                    {!connected
                      ? "Reconnect helper"
                      : !cat
                        ? "Refresh catalog"
                        : !hasRequiredPackages
                          ? "Browse content"
                          : !snapshot?.assettoPath
                            ? "Set up Assetto Corsa"
                            : allReady
                              ? "Check for updates"
                              : "Download missing content"}
                  </Button>
                  {cat && hasRequiredPackages && (
                    <>
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
                          ? "Readiness is based on files verified by your local helper."
                          : "Set your Assetto Corsa folder in Settings to install content."}
                      </small>
                    </>
                  )}
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
              <section
                className="latest-content"
                aria-labelledby="latest-content-title"
              >
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
                    <article
                      className="latest-content-item"
                      key={item.package.id}
                    >
                      <PackageArtwork
                        package={item.package}
                        className="latest-content-icon"
                      />
                      <div className="latest-content-info">
                        <span className="latest-content-type">
                          {item.package.type} ·{" "}
                          {item.package.required ? "Required" : "Optional"}
                        </span>
                        <h3>{item.package.name}</h3>
                        <span className="latest-content-version">
                          Version <strong>{item.package.version}</strong>
                        </span>
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
                      Connect the helper and refresh the catalog to see
                      available packages.
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
                          <PackageArtwork package={s.package} />
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
                <StandingsPreview
                  results={
                    !cat || results?.sourceUrl === resultsSource
                      ? results
                      : null
                  }
                  loading={resultsLoading}
                  error={resultsError}
                  connected={connected}
                  configured={!cat || !!resultsSource}
                  teams={portal.portal?.teams ?? []}
                />
              </div>
            </>
          )}
          {page === "content" && (
            <nav className="content-tabs" aria-label="Content sections">
              <a
                href="#content"
                aria-current={contentTab === "library" ? "page" : undefined}
              >
                Library
              </a>
              <a
                href="#downloads"
                aria-current={contentTab === "downloads" ? "page" : undefined}
              >
                <Download size={15} aria-hidden="true" />
                Downloads
                {ongoing.length > 0 && (
                  <span className="nav-count">{ongoing.length}</span>
                )}
              </a>
            </nav>
          )}
          {page === "content" && contentTab === "library" && (
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
                  {library.filter((s) => s.state === "ready").length} UP TO DATE
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
              <section className="content-grid" aria-label="Official content">
                {library.map((s) => (
                  <ContentCard
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
              </section>
              <p className="footnote">
                <ShieldCheck size={15} />
                Packages are installed only in validated Assetto Corsa content
                folders.
              </p>
            </>
          )}
          {page === "servers" && (
            <ServersPage
              connected={connected}
              active={page === "servers"}
              packages={snapshot?.catalog?.manifest.content ?? []}
              teams={portal.portal?.teams ?? []}
            />
          )}
          {page === "content" && contentTab === "downloads" && (
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
              <section className="results-section">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">LIVE FROM MAKROBEASTS</p>
                    <h2>Driver standings</h2>
                  </div>
                  <Button
                    disabled={!connected || resultsLoading}
                    onClick={async () => {
                      setResultsLoading(true);
                      setResultsError("");
                      try {
                        setResults(
                          await api<ChampionshipResults>(
                            "/results?refresh=true",
                          ),
                        );
                      } catch (e) {
                        setResultsError(
                          e instanceof Error
                            ? e.message
                            : "Could not refresh standings.",
                        );
                      } finally {
                        setResultsLoading(false);
                      }
                    }}
                  >
                    <RefreshCw
                      size={15}
                      className={resultsLoading ? "spin" : undefined}
                    />
                    Refresh standings
                  </Button>
                </div>
                {results?.updatedAt && (
                  <p className="results-updated">
                    Updated {new Date(results.updatedAt).toLocaleString()}
                  </p>
                )}
                {resultsError && (
                  <div className="global-notice error-notice" role="alert">
                    <AlertTriangle size={16} />
                    <span>{resultsError}</span>
                  </div>
                )}
                {connected && cat && !resultsSource && (
                  <EmptyState title="No standings source configured">
                    {cat
                      ? "This championship has no standings source configured yet."
                      : "Refresh the catalog to load the championship standings source."}
                  </EmptyState>
                )}
                {resultsLoading && !results && (
                  <EmptyState title="Loading driver standings">
                    Connecting to MakroBeasts…
                  </EmptyState>
                )}
                {!resultsLoading &&
                  !resultsError &&
                  results &&
                  (results.standings.length ? (
                    <div className="results-table-wrap">
                      <table className="results-table championship-standings-table">
                        <colgroup>
                          <col className="standings-position-column" />
                          <col className="standings-number-column" />
                          <col className="standings-driver-column" />
                          <col className="standings-team-column" />
                          <col className="standings-points-column" />
                        </colgroup>
                        <thead>
                          <tr>
                            <th>Pos</th>
                            <th>#</th>
                            <th>Driver</th>
                            <th>Team</th>
                            <th>Points</th>
                          </tr>
                        </thead>
                        <tbody>
                          {results.standings.map((row) => {
                            const teamCatalog = portal.portal?.teams ?? [];
                            const configuredTeam = resolveTeam(
                              row.driver,
                              "",
                              teamCatalog,
                            );
                            const teamNames = [
                              ...(configuredTeam ? [configuredTeam.name] : []),
                              ...(row.teamNames ?? []),
                            ].filter(
                              (name, index, names) =>
                                names.findIndex(
                                  (candidate) =>
                                    candidate.localeCompare(name, undefined, {
                                      sensitivity: "base",
                                    }) === 0,
                                ) === index,
                            );
                            const matchedTeam = (row.teamNames ?? []).find(
                              (name) => resolveTeam("", name, teamCatalog),
                            );
                            return (
                              <tr key={`${row.position}-${row.driver}`}>
                                <td>
                                  <span
                                    className={
                                      row.position <= 3
                                        ? `standing-position p${row.position}`
                                        : "standing-position"
                                    }
                                  >
                                    {row.position.toString().padStart(2, "0")}
                                  </span>
                                </td>
                                <td className="driver-number">{row.number}</td>
                                <td className="driver-name">
                                  <TeamDriver
                                    driverName={row.driver}
                                    teamName={matchedTeam ?? ""}
                                    teams={teamCatalog}
                                  />
                                </td>
                                <td className="standings-team-name">
                                  <div className="standings-team-list">
                                    {teamNames.map((name) => {
                                      const team = resolveTeam(
                                        "",
                                        name,
                                        teamCatalog,
                                      );
                                      return (
                                        <span
                                          className="standings-team-item"
                                          key={name}
                                          style={
                                            team
                                              ? ({
                                                  "--team-color": team.color,
                                                } as CSSProperties)
                                              : undefined
                                          }
                                        >
                                          {team ? (
                                            <img
                                              src={team.logo}
                                              alt=""
                                              loading="lazy"
                                            />
                                          ) : null}
                                          {name}
                                        </span>
                                      );
                                    })}
                                  </div>
                                </td>
                                <td className="driver-points">{row.points}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <EmptyState title="No standings published">
                      MakroBeasts has not published the driver classification
                      yet.
                    </EmptyState>
                  ))}
                {results?.sourceUrl && (
                  <a
                    className="text-link results-source-link"
                    href={results.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open MakroBeasts championship <ExternalLink size={14} />
                  </a>
                )}
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
                        setResults(
                          await api<ChampionshipResults>(
                            "/results?refresh=true",
                          ),
                        );
                      } catch (e) {
                        setResultsError(
                          e instanceof Error
                            ? e.message
                            : "Could not refresh results.",
                        );
                      } finally {
                        setResultsLoading(false);
                      }
                    }}
                  >
                    <RefreshCw
                      size={15}
                      className={resultsLoading ? "spin" : undefined}
                    />
                    Refresh results
                  </Button>
                </div>
                <p>
                  Race results are loaded from the official championship page.
                </p>
                {results?.sourceUrl && (
                  <a
                    className="text-link results-source-link"
                    href={results.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
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
              {connected && cat && !resultsSource && (
                <EmptyState title="No results source configured">
                  {cat
                    ? "This championship has no race results source configured yet."
                    : "Refresh the catalog to load the championship results source."}
                </EmptyState>
              )}
              {!resultsLoading && !resultsError && results && (
                <section className="results-section">
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">OFFICIAL RACE RESULTS</p>
                      <h2>Race results</h2>
                    </div>
                    <span className="eyebrow">
                      {results.races.length} ROUNDS
                    </span>
                  </div>
                  {results.races.length ? (
                    <div className="race-results-list">
                      {results.races.map((race) => (
                        <article className="race-result-card" key={race.id}>
                          <div className="race-result-heading">
                            <span
                              className="round-number"
                              role="img"
                              aria-label={`Round ${race.round.replace(/^R/i, "")}`}
                            >
                              <span aria-hidden="true">
                                {race.round.replace(/^R/i, "").padStart(2, "0")}
                              </span>
                            </span>
                            <div>
                              <span className="eyebrow">
                                {race.round} ·{" "}
                                {race.sessions
                                  .map((session) =>
                                    formatRaceSessionName(session.name),
                                  )
                                  .join(" / ")}
                              </span>
                              <h3>{race.name}</h3>
                              {race.venue && <p>{race.venue}</p>}
                            </div>
                            <a
                              className="text-link"
                              href={race.url}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={`Open ${race.name} results on MakroBeasts`}
                            >
                              Official page <ExternalLink size={14} />
                            </a>
                          </div>
                          <details className="race-full-results">
                            <summary>
                              <span>Full results</span>
                              <span className="race-results-count">
                                {race.sessions.reduce(
                                  (total, session) =>
                                    total + session.results.length,
                                  0,
                                )}{" "}
                                entries
                              </span>
                            </summary>
                            <div className="race-sessions-grid">
                              {[...race.sessions]
                                .sort((a, b) =>
                                  a.name.localeCompare(b.name, undefined, {
                                    numeric: true,
                                  }),
                                )
                                .map((session) => (
                                  <section
                                    className="race-session-results"
                                    key={session.name}
                                    aria-label={`${race.name} · ${session.name}`}
                                  >
                                    <h4>
                                      {formatRaceSessionName(session.name)}
                                    </h4>
                                    <div
                                      className="podium-row podium-columns"
                                      aria-hidden="true"
                                    >
                                      <span>Pos</span>
                                      <span>#</span>
                                      <span>Driver</span>
                                      <span>Car</span>
                                      <span>Time / gap</span>
                                    </div>
                                    <div className="podium-list">
                                      {session.results.map((entry, index) => (
                                        <div
                                          className={`podium-row podium-${entry.position}`}
                                          key={`${entry.position}-${entry.driver}`}
                                        >
                                          <span className="podium-place">
                                            {entry.position}
                                          </span>
                                          <span className="driver-number">
                                            {entry.number}
                                          </span>
                                          <strong>
                                            <TeamDriver
                                              driverName={entry.driver}
                                              teams={portal.portal?.teams ?? []}
                                            />
                                          </strong>
                                          <span className="result-car">
                                            {entry.car || "—"}
                                          </span>
                                          <span className="podium-time">
                                            {formatRaceResultTime(
                                              session.results,
                                              index,
                                            )}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </section>
                                ))}
                            </div>
                          </details>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <EmptyState title="No race results published">
                      Race results will appear here after MakroBeasts publishes
                      them.
                    </EmptyState>
                  )}
                </section>
              )}
              {resultsLoading && (
                <EmptyState title="Loading official results">
                  Connecting to MakroBeasts…
                </EmptyState>
              )}
              {!connected && (
                <EmptyState title="Connect the desktop helper">
                  The helper loads and caches championship results for this app.
                </EmptyState>
              )}
            </>
          )}
          {page === "settings" && (
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
                  <h2>Application updates</h2>
                  <Badge state={connected ? "ready" : "offline"}>
                    {connected ? "Connected" : "Offline"}
                  </Badge>
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
                    <dd>{snapshot?.version ?? "Unavailable"}</dd>
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
                    disabled={!connected || appUpdate.loading}
                    onClick={() => void appUpdate.check()}
                  >
                    {appUpdate.loading ? "Checking…" : "Check for app updates"}
                  </Button>
                </div>
                {appUpdate.error && (
                  <p className="job-error">{appUpdate.error}</p>
                )}
                {appUpdate.update && (
                  <p>
                    {appUpdate.update.available
                      ? `Version ${appUpdate.update.version} is available. `
                      : appUpdate.update.published
                        ? "You have the latest published app. "
                        : "No application release has been published yet. "}
                    {appUpdate.update.url && (
                      <a
                        className="text-link"
                        href={appUpdate.update.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View release
                        <ArrowUpRight size={15} />
                      </a>
                    )}
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
          <SponsorsFooter sponsors={portal.portal?.sponsors ?? []} />
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
