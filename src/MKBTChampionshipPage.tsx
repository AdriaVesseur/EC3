import { useEffect, useId, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronRight,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  ArrowRight,
  Car,
  Flag,
  Users,
} from "lucide-react";
import { api } from "./api";
import { Button, EmptyState, Modal } from "./components";
import { ChampionshipOverview } from "./ChampionshipOverview";
import { httpsUrl } from "./portal-types";
import { resolveTeam, TeamDriver } from "./TeamDriver";
import type { Team } from "./portal-types";
import type { ChampionshipResults } from "./types";
import type { RaceResult, RaceResultRow } from "./races-types";
import type {
  ActiveChampionship,
  useActiveChampionships,
} from "./useActiveChampionships";
import "./races.css";
import "./championships.css";

type Resource = ReturnType<typeof useActiveChampionships>;
type PublishedRound = ChampionshipResults["races"][number];

const sessionKey = (name: string) =>
  name
    .toLocaleLowerCase()
    .replace(/\s+/g, "")
    .replace(/^carrera$/, "carrera1")
    .replace(/^race$/, "race1");
const isRace = (name: string) =>
  /carrera|race/i.test(name) && !/qual|practice|warmup/i.test(name);
function gap(rows: RaceResultRow[], index: number) {
  const time = rows[index].time || "—";
  if (!index || time.startsWith("+")) return time;
  const seconds = (value: string) =>
    /^\d+(?::\d{1,2}){0,2}(?:\.\d+)?$/.test(value)
      ? value.split(":").reduce((sum, part) => sum * 60 + Number(part), 0)
      : null;
  const winner = seconds(rows[0].time),
    current = seconds(time);
  if (winner === null || current === null || current < winner) return time;
  const delta = current - winner;
  return (
    "+" +
    (delta >= 60
      ? `${Math.floor(delta / 60)}:${(delta % 60).toFixed(3).padStart(6, "0")}`
      : delta.toFixed(3))
  );
}

function ChampionshipArtwork({
  championship,
  hero = false,
}: {
  championship: ActiveChampionship;
  hero?: boolean;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const source = httpsUrl(championship.image);
  return (
    <div
      className={`race-catalog-art ${hero ? "race-catalog-detail-art" : ""}`}
    >
      {source && failed !== source ? (
        <img
          src={source}
          alt=""
          loading={hero ? "eager" : "lazy"}
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(source)}
        />
      ) : (
        <Flag size={hero ? 48 : 40} aria-hidden="true" />
      )}
    </div>
  );
}

type ChampionshipTab = "overview" | "standings" | "results";
function championshipCarSummary(championship: ActiveChampionship) {
  const cars = championship.car?.split(" · ").filter(Boolean) ?? [];
  return cars.length > 2 ? `${cars.length} car models` : championship.car;
}
export function MKBTChampionshipPage({
  mode,
  resource,
  teams,
  connected,
}: {
  mode: "standings" | "results";
  resource: Resource;
  teams: Team[];
  connected: boolean;
}) {
  const [openedId, setOpenedId] = useState<string | null>(null);
  const [tab, setTab] = useState<ChampionshipTab>("overview");
  const tabId = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const previousMode = useRef(mode);
  const opened = resource.catalog?.championships.find(
    (championship) => championship.id === openedId,
  );
  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "standings", label: "Standings" },
    { id: "results", label: "Results" },
  ] as const;
  useEffect(() => {
    if (previousMode.current !== mode) {
      previousMode.current = mode;
      setOpenedId(null);
    }
  }, [mode]);
  useEffect(() => {
    if (openedId && resource.catalog && !opened) setOpenedId(null);
  }, [openedId, opened, resource.catalog]);
  function open(championship: ActiveChampionship) {
    resource.select(championship.id);
    setTab("overview");
    setOpenedId(championship.id);
  }
  return (
    <section
      className="mkbt-championship-page races-page"
      aria-label="Active championships"
    >
      <div className="race-catalog-header">
        <div>
          <p className="eyebrow">
            <Flag size={13} aria-hidden="true" />
            MKBT · CURRENT SEASON
          </p>
          <h2>Active championships</h2>
          <p>
            Choose a championship to explore its information, standings and race
            results.
          </p>
        </div>
        <Button
          onClick={() => void resource.refreshCatalog()}
          disabled={!connected || resource.catalogLoading}
        >
          <RefreshCw
            size={15}
            className={resource.catalogLoading ? "spin" : undefined}
            aria-hidden="true"
          />
          Refresh championships
        </Button>
      </div>
      {resource.catalogError && (
        <p className="mkbt-championship-notice" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          {resource.catalogError}
        </p>
      )}
      {resource.catalog?.warnings.map((warning, index) => (
        <p className="mkbt-championship-notice" role="status" key={index}>
          {warning}
        </p>
      ))}
      {resource.catalogLoading && !resource.catalog && (
        <div className="mkbt-championship-loading" role="status">
          <LoaderCircle size={20} className="spin" aria-hidden="true" />
          Loading championships…
        </div>
      )}
      {!connected && (
        <EmptyState title="Connect the desktop helper">
          Reconnect to load MKBT's active championships. Previously loaded
          championship cards remain available.
        </EmptyState>
      )}
      {resource.catalog && (
        <ul className="mkbt-championship-grid">
          {resource.catalog.championships.map((championship) => (
            <li
              className="race-catalog-row mkbt-championship-card"
              key={championship.id}
            >
              <div className="race-catalog-cover">
                <ChampionshipArtwork championship={championship} />
                <div className="race-catalog-cover-tags">
                  <span>CHAMPIONSHIP</span>
                  {championship.license && (
                    <span className="race-catalog-license">
                      {championship.license}
                    </span>
                  )}
                </div>
                <strong className="race-catalog-cover-series">
                  {championship.name}
                </strong>
              </div>
              <div className="race-catalog-copy">
                <div className="race-catalog-series">
                  <span>MKBT SIMRACING</span>
                  <span className="race-catalog-status upcoming">
                    {championship.status === "active"
                      ? "In progress"
                      : "Upcoming"}
                  </span>
                </div>
                <h3>{championship.name}</h3>
                {championship.car && (
                  <p className="race-catalog-car" title={championship.car}>
                    <Car size={14} aria-hidden="true" />
                    {championshipCarSummary(championship)}
                  </p>
                )}
                <div className="race-catalog-tags">
                  {championship.format && <span>{championship.format}</span>}
                </div>
                <dl className="race-catalog-metrics">
                  <div>
                    <dt>Next round</dt>
                    <dd>
                      {championship.dateLabel || "See championship schedule"}
                    </dd>
                  </div>
                  <div>
                    <dt>Series entries</dt>
                    <dd className="race-catalog-grid">
                      <Users size={15} aria-hidden="true" />
                      <strong>
                        {championship.registered != null
                          ? `${championship.registered}${championship.capacity != null ? ` / ${championship.capacity}` : ""}`
                          : "See MKBT"}
                      </strong>
                    </dd>
                    {championship.rounds != null && (
                      <dd className="mkbt-championship-round-count">
                        {championship.rounds} rounds
                      </dd>
                    )}
                  </div>
                </dl>
              </div>
              <div className="race-catalog-entry">
                <span className="race-catalog-details" aria-hidden="true">
                  View championship
                  <ArrowRight size={14} />
                </span>
              </div>
              <button
                className="mkbt-championship-open"
                type="button"
                aria-label={`Open ${championship.name}`}
                onClick={() => open(championship)}
              />
            </li>
          ))}
        </ul>
      )}
      {!resource.catalogLoading &&
        connected &&
        resource.catalog?.championships.length === 0 && (
          <EmptyState title="No active championships">
            MKBT has no active championships published at the moment. Use
            Refresh championships to check again.
          </EmptyState>
        )}
      {opened && (
        <Modal
          key={opened.id}
          title={opened.name}
          className="race-catalog-modal mkbt-championship-modal"
          onClose={() => setOpenedId(null)}
        >
          <ChampionshipArtwork championship={opened} hero />
          <div
            className="race-info-tabs"
            role="tablist"
            aria-label="Championship information"
          >
            {tabs.map((item, index) => (
              <button
                key={item.id}
                ref={(element) => {
                  buttons.current[index] = element;
                }}
                id={`${tabId}-${item.id}`}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                aria-controls={`${tabId}-panel-${item.id}`}
                tabIndex={tab === item.id ? 0 : -1}
                onClick={() => setTab(item.id)}
                onKeyDown={(event) => {
                  const next =
                    event.key === "ArrowRight"
                      ? (index + 1) % tabs.length
                      : event.key === "ArrowLeft"
                        ? (index + tabs.length - 1) % tabs.length
                        : event.key === "Home"
                          ? 0
                          : event.key === "End"
                            ? tabs.length - 1
                            : null;
                  if (next !== null) {
                    event.preventDefault();
                    setTab(tabs[next].id);
                    buttons.current[next]?.focus();
                  }
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
          {tabs.map((item) => (
            <div
              key={item.id}
              id={`${tabId}-panel-${item.id}`}
              role="tabpanel"
              aria-labelledby={`${tabId}-${item.id}`}
              tabIndex={0}
              hidden={tab !== item.id}
              className="mkbt-championship-panel"
            >
              {tab === item.id &&
                (item.id === "overview" ? (
                  <ChampionshipOverview
                    championship={opened}
                    connected={connected}
                    teams={teams}
                  />
                ) : resource.selected?.id === opened.id ? (
                  <ChampionshipClassification
                    mode={item.id}
                    resource={resource}
                    teams={teams}
                    connected={connected}
                  />
                ) : (
                  <div className="mkbt-championship-loading" role="status">
                    Loading championship…
                  </div>
                ))}
            </div>
          ))}
        </Modal>
      )}
    </section>
  );
}
function driverTeams(
  driver: string,
  published: string | undefined | null,
  teams: Team[],
) {
  // Published competition membership takes precedence over an old driver alias.
  return published && !resolveTeam("", published, teams) ? [] : teams;
}
function ResultTable({
  rows,
  label,
  teams,
}: {
  rows: RaceResultRow[];
  label: string;
  teams: Team[];
}) {
  return (
    <div
      className="mkbt-table-scroll"
      role="region"
      aria-label={`${label} table`}
      tabIndex={0}
    >
      <table className="results-table mkbt-race-table" aria-label={label}>
        <thead>
          <tr>
            <th scope="col">Pos</th>
            <th scope="col">#</th>
            <th scope="col">Driver</th>
            <th scope="col">Team</th>
            <th scope="col">Time / gap</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((entry, index) => (
            <tr key={`${entry.position}-${entry.driver}-${index}`}>
              <td>
                <span className={`standing-position p${entry.position}`}>
                  {entry.positionLabel || entry.position || "—"}
                </span>
              </td>
              <td className="driver-number">{entry.number || "—"}</td>
              <td className="driver-name">
                <TeamDriver
                  driverName={entry.driver}
                  teamName={entry.team ?? ""}
                  teams={driverTeams(entry.driver, entry.team, teams)}
                />
              </td>
              <td className="result-team">
                {entry.team || resolveTeam(entry.driver, "", teams)?.name || ""}
              </td>
              <td className="podium-time">{gap(rows, index)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Standings({
  results,
  teams,
}: {
  results: ChampionshipResults;
  teams: Team[];
}) {
  if (!results.standings.length)
    return (
      <EmptyState title="No standings published">
        MKBT has not published the driver classification for this championship
        yet.
      </EmptyState>
    );
  return (
    <div
      className="results-table-wrap"
      role="region"
      aria-label="Driver standings table"
      tabIndex={0}
    >
      <table
        className="results-table championship-standings-table"
        aria-label="Driver standings"
      >
        <colgroup>
          <col className="standings-position-column" />
          <col className="standings-number-column" />
          <col className="standings-driver-column" />
          <col className="standings-team-column" />
          <col className="standings-points-column" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">Pos</th>
            <th scope="col">#</th>
            <th scope="col">Driver</th>
            <th scope="col">Team</th>
            <th scope="col">Points</th>
          </tr>
        </thead>
        <tbody>
          {results.standings.map((row) => {
            const published = row.teamNames?.filter(Boolean) ?? [];
            const names = published.length
              ? [...new Set(published)]
              : [resolveTeam(row.driver, "", teams)?.name].filter(
                  (name): name is string => !!name,
                );
            const matched =
              names.find((name) => resolveTeam("", name, teams)) ?? names[0];
            return (
              <tr key={`${row.position}-${row.driver}`}>
                <td>
                  <span className={`standing-position p${row.position}`}>
                    {String(row.position).padStart(2, "0")}
                  </span>
                </td>
                <td className="driver-number">{row.number || "—"}</td>
                <td className="driver-name">
                  <TeamDriver
                    driverName={row.driver}
                    teamName={matched}
                    teams={driverTeams(row.driver, matched, teams)}
                  />
                </td>
                <td className="standings-team-name">{names.join(" · ")}</td>
                <td className="driver-points">{row.points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
function RoundResults({
  championshipId,
  race,
  teams,
  connected,
}: {
  championshipId: string;
  race: PublishedRound;
  teams: Team[];
  connected: boolean;
}) {
  const [expanded, setExpanded] = useState<string[]>([]);
  const [full, setFull] = useState<RaceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const panelId = useId();
  useEffect(() => () => request.current?.abort(), []);
  async function loadFull() {
    if (!connected || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    try {
      const data = await api<RaceResult>(
        `/championships/${encodeURIComponent(championshipId)}/results/${encodeURIComponent(race.id)}`,
        undefined,
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      if (
        data.id !== race.id ||
        data.url !== race.url ||
        data.resultsScope !== "full" ||
        !Array.isArray(data.sessions)
      )
        throw new Error(
          "MKBT returned a classification for a different race. Retry loading the top 20.",
        );
      setFull(data);
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not load the full classification. Retry in a moment.",
        );
    } finally {
      if (request.current === controller) {
        request.current = null;
        if (!controller.signal.aborted) setLoading(false);
      }
    }
  }
  const sessions = race.sessions.filter((session) => isRace(session.name));
  return (
    <article className="race-result-card mkbt-round-card">
      <header className="race-result-heading">
        <span className="round-number">{race.round}</span>
        <div>
          <h3>{race.name}</h3>
          <p>{race.venue}</p>
        </div>
        <a
          className="text-link"
          href={race.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Official result <ExternalLink size={14} aria-hidden="true" />
        </a>
      </header>
      <div className="mkbt-race-sessions">
        {sessions.map((session, index) => {
          const name =
            session.name.toLocaleLowerCase() === "carrera"
              ? "Carrera 1"
              : session.name;
          const key = sessionKey(session.name);
          const open = expanded.includes(key);
          const complete = full?.sessions.find(
            (candidate) => sessionKey(candidate.name) === key,
          );
          const podium = (complete?.results ?? session.results).slice(0, 3);
          const available = complete?.results ?? null;
          const regionId = `${panelId}-${index}`;
          return (
            <section
              className="mkbt-race-session"
              aria-label={session.name}
              key={key}
            >
              <h4>
                {name}
                <span>Top 3</span>
              </h4>
              <ResultTable
                rows={podium}
                label={`${session.name} top 3`}
                teams={teams}
              />
              <button
                className="top-twenty-trigger"
                type="button"
                aria-expanded={open}
                aria-controls={regionId}
                onClick={() => {
                  setExpanded((current) =>
                    open
                      ? current.filter((value) => value !== key)
                      : [...current, key],
                  );
                  if (!open && !full && !available) void loadFull();
                }}
              >
                <span>Top 20</span>
                <ChevronRight
                  className={open ? "expanded" : undefined}
                  size={15}
                  aria-hidden="true"
                />
              </button>
              <div
                hidden={!open}
                id={regionId}
                role="region"
                aria-label={`${session.name} top 20`}
              >
                {loading && !available && (
                  <div className="mkbt-championship-loading" role="status">
                    <LoaderCircle
                      className="spin"
                      size={18}
                      aria-hidden="true"
                    />
                    Loading top 20…
                  </div>
                )}
                {available && (
                  <>
                    <p className="mkbt-result-count">
                      {Math.min(20, available.length)} drivers
                      {available.length < 20
                        ? " · All published finishers"
                        : " · Top 20"}
                    </p>
                    <ResultTable
                      rows={available.slice(0, 20)}
                      label={`${session.name} top 20`}
                      teams={teams}
                    />
                  </>
                )}
                {!available && !loading && (
                  <div className="mkbt-result-empty">
                    <p role={error ? "alert" : "status"}>
                      {error ||
                        "MKBT has not published a complete classification for this session yet."}
                    </p>
                    <Button
                      onClick={() => void loadFull()}
                      disabled={!connected}
                    >
                      Retry top 20
                    </Button>
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
      {!sessions.length && (
        <EmptyState title="No race classification published">
          This round has no published race sessions yet.
        </EmptyState>
      )}
    </article>
  );
}

function ChampionshipClassification({
  mode,
  resource,
  teams,
  connected,
}: {
  mode: "standings" | "results";
  resource: Resource;
  teams: Team[];
  connected: boolean;
}) {
  const {
    catalog,
    selected,
    results,
    loading,
    error,
    catalogLoading,
    catalogError,
  } = resource;
  return (
    <div className="mkbt-championship-page">
      {!connected && (
        <EmptyState title="Connect the desktop helper">
          Reconnect to load MKBT's active championships and refresh their
          classifications.
        </EmptyState>
      )}
      {!selected && connected && !catalogLoading && !catalogError && (
        <EmptyState title="No active championships">
          MKBT has no active championships published at the moment. Use Refresh
          championships to check again.
        </EmptyState>
      )}
      {selected && (
        <section
          className="results-section"
          aria-label={
            mode === "standings"
              ? "Championship standings"
              : "Championship results"
          }
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">
                {mode === "standings"
                  ? "DRIVER STANDINGS"
                  : "OFFICIAL RACE RESULTS"}
              </p>
              <h2>{selected.name}</h2>
            </div>
            <Button
              disabled={!connected || loading}
              onClick={() => void resource.refreshResults()}
            >
              <RefreshCw
                size={15}
                className={loading ? "spin" : undefined}
                aria-hidden="true"
              />
              {mode === "standings" ? "Refresh standings" : "Refresh results"}
            </Button>
          </div>
          <div className="mkbt-championship-meta">
            <a
              className="text-link"
              href={`${selected.url}${mode === "results" ? "#results" : "#standings"}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open MKBT championship{" "}
              <ExternalLink size={14} aria-hidden="true" />
            </a>
            {results?.updatedAt && (
              <span>
                Updated {new Date(results.updatedAt).toLocaleString()}
                {resource.stale ? " · Last available data" : ""}
              </span>
            )}
          </div>
          {error && (
            <p className="mkbt-championship-notice" role="alert">
              <AlertTriangle size={16} aria-hidden="true" />
              {error}
            </p>
          )}
          {loading && !results && (
            <div className="mkbt-championship-loading" role="status">
              <LoaderCircle className="spin" size={20} aria-hidden="true" />
              {mode === "standings"
                ? "Loading driver standings…"
                : "Loading official results…"}
            </div>
          )}
          {results &&
            (mode === "standings" ? (
              <Standings results={results} teams={teams} />
            ) : results.races.length ? (
              <div className="race-results-list" key={selected.id}>
                {results.races.map((race) => (
                  <RoundResults
                    key={`${selected.id}:${race.id}`}
                    championshipId={selected.id}
                    race={race}
                    teams={teams}
                    connected={connected}
                  />
                ))}
              </div>
            ) : (
              <EmptyState title="No race results published">
                MKBT has not published race results for this championship yet.
              </EmptyState>
            ))}
        </section>
      )}
    </div>
  );
}
