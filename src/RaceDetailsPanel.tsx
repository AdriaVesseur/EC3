import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  LoaderCircle,
  RefreshCw,
  Search,
} from "lucide-react";
import { api } from "./api";
import { Button, EmptyState } from "./components";
import { httpsUrl, type Team } from "./portal-types";
import { resolveTeam, TeamDriver } from "./TeamDriver";
import type {
  RaceDetails,
  RaceEntry,
  RaceResult,
  RaceResultRow,
} from "./races-types";

const cache = new Map<string, { value: unknown; at: number }>();
const cacheMs = 5 * 60 * 1000;
function validResponse(value: unknown, field: "raceId" | "id", id: string) {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  return (
    data[field] === id &&
    (field === "id"
      ? Array.isArray(data.sessions)
      : [data.participants, data.standings, data.results, data.warnings].every(
          Array.isArray,
        ))
  );
}
function useRaceInfo<T>(
  path: string,
  connected: boolean,
  field: "raceId" | "id",
  id: string,
) {
  const request = useRef<AbortController | null>(null);
  const [state, setState] = useState<{
    path: string;
    data: T | null;
    error: string;
    loading: boolean;
  }>({
    path,
    data: (cache.get(path)?.value as T) ?? null,
    error: "",
    loading: connected,
  });
  const load = useCallback(
    async (force = false) => {
      request.current?.abort();
      const cached = cache.get(path);
      const previous =
        cached && validResponse(cached.value, field, id)
          ? (cached.value as T)
          : null;
      if (
        !connected ||
        (!force && previous && Date.now() - cached!.at < cacheMs)
      ) {
        setState({ path, data: previous, loading: false, error: "" });
        return;
      }
      const controller = new AbortController();
      request.current = controller;
      setState({ path, data: previous, loading: true, error: "" });
      try {
        const next = await api<T>(
          path + (force ? "?refresh=true" : ""),
          undefined,
          { signal: controller.signal },
        );
        if (!validResponse(next, field, id))
          throw new Error(
            "MKBT returned unsupported race information. Please refresh or open the official page.",
          );
        if (controller.signal.aborted) return;
        cache.delete(path);
        cache.set(path, { value: next, at: Date.now() });
        if (cache.size > 60) cache.delete(cache.keys().next().value!);
        setState({ path, data: next, loading: false, error: "" });
      } catch (cause) {
        if (!controller.signal.aborted)
          setState({
            path,
            data: previous,
            loading: false,
            error:
              cause instanceof Error
                ? cause.message
                : "Could not load race information. Try refreshing.",
          });
      } finally {
        if (request.current === controller) request.current = null;
      }
    },
    [path, connected, field, id],
  );
  useEffect(() => {
    void load();
    return () => {
      request.current?.abort();
      request.current = null;
    };
  }, [load]);
  const current =
    state.path === path ? state : { data: null, error: "", loading: connected };
  return { ...current, refresh: () => load(true) };
}
const officialLink = (value: string) => {
  const safe = httpsUrl(value);
  if (!safe) return undefined;
  const url = new URL(safe);
  return !url.port &&
    ["makrobeasts.com", "www.makrobeasts.com"].includes(url.hostname)
    ? safe
    : undefined;
};
const normalize = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
const number = (value: string) =>
  !value || value === "—" ? "—" : value.startsWith("#") ? value : "#" + value;
function seconds(value: string) {
  const raw = value.trim().replace(",", ".");
  if (!/^\d+(?::\d{1,2}){0,2}(?:\.\d+)?$/.test(raw)) return null;
  return raw.split(":").reduce((sum, part) => sum * 60 + Number(part), 0);
}
function resultTime(row: RaceResultRow, index: number, rows: RaceResultRow[]) {
  const raw = row.time || "—";
  if (!index || raw.startsWith("+")) return raw;
  const winner = seconds(rows[0]?.time ?? ""),
    current = seconds(raw);
  if (winner === null || current === null || current < winner) return raw;
  const gap = current - winner;
  if (gap < 60) return "+" + gap.toFixed(3);
  return (
    "+" + Math.floor(gap / 60) + ":" + (gap % 60).toFixed(3).padStart(6, "0")
  );
}
function TableRegion({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div
      className="race-info-table-wrap"
      role="region"
      aria-label={label + " table"}
      tabIndex={0}
    >
      {children}
    </div>
  );
}
function LoadingInfo({
  text = "Loading race information…",
}: {
  text?: string;
}) {
  return (
    <div className="race-info-loading" role="status">
      <LoaderCircle size={20} className="spin" aria-hidden="true" />
      <span>{text}</span>
    </div>
  );
}

function ResultView({
  race,
  result,
  connected,
  teams,
  teamFor,
}: {
  race: RaceEntry;
  result: RaceResult;
  connected: boolean;
  teams: Team[];
  teamFor: (driver: string, published?: string) => string;
}) {
  const needsFull = result.resultsScope !== "full";
  const resource = useRaceInfo<RaceResult>(
    `/races/${encodeURIComponent(race.id)}/results/${encodeURIComponent(result.id)}`,
    connected && needsFull,
    "id",
    result.id,
  );
  const current = needsFull ? (resource.data ?? result) : result;
  const url = officialLink(current.url);
  return (
    <div className="race-info-result">
      <div className="race-info-result-heading">
        <div>
          <h4>{current.name}</h4>
          <p>{current.venue}</p>
        </div>
        {needsFull && (
          <Button
            onClick={() => void resource.refresh()}
            disabled={!connected || resource.loading}
          >
            <RefreshCw
              size={13}
              className={resource.loading ? "spin" : ""}
              aria-hidden="true"
            />
            Refresh results
          </Button>
        )}
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer">
            Official full results
            <ArrowUpRight size={13} aria-hidden="true" />
          </a>
        )}
      </div>
      {resource.loading && needsFull && !resource.data ? (
        <LoadingInfo text="Loading full results…" />
      ) : (
        <>
          {resource.error && (
            <div className="race-info-notice" role="status">
              <AlertTriangle size={16} aria-hidden="true" />
              <p>
                {resource.error} The published preview remains available below.
              </p>
            </div>
          )}
          {current.resultsScope === "podium" && (
            <p className="race-info-scope">
              Podium preview · Open the official full results for the complete
              field.
            </p>
          )}
          {current.sessions.length === 0 ? (
            <EmptyState title="Results not published yet">
              MKBT has not published a classification for this round.
            </EmptyState>
          ) : (
            current.sessions.map((session, sessionIndex) => (
              <section
                className="race-info-session"
                key={session.name + sessionIndex}
              >
                <div className="race-info-session-heading">
                  <h4>{session.name}</h4>
                  <span>
                    {session.results.length} drivers
                    {current.resultsScope === "podium" ? " in preview" : ""}
                  </span>
                </div>
                <TableRegion label={session.name}>
                  <table
                    className="race-info-table results-table"
                    aria-label={session.name}
                  >
                    <thead>
                      <tr>
                        <th scope="col">Pos</th>
                        <th scope="col">#</th>
                        <th scope="col">Driver</th>
                        <th scope="col">Team</th>
                        <th scope="col" className="numeric">
                          Time / gap
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {session.results.map((row, index) => (
                        <tr key={row.driver + index}>
                          <td className="race-info-position">
                            {row.positionLabel || row.position || "—"}
                          </td>
                          <td>{number(row.number)}</td>
                          <td>
                            <TeamDriver
                              driverName={row.driver}
                              teamName={teamFor(row.driver, row.team ?? "")}
                              teams={teams}
                            />
                          </td>
                          <td>{teamFor(row.driver, row.team ?? "")}</td>
                          <td className="numeric">
                            {resultTime(row, index, session.results)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableRegion>
              </section>
            ))
          )}
        </>
      )}
    </div>
  );
}

const tabs = [
  { id: "overview", label: "Overview" },
  { id: "participants", label: "Participants" },
  { id: "standings", label: "Standings" },
  { id: "results", label: "Results" },
] as const;
type DetailTab = (typeof tabs)[number]["id"];
export function RaceDetailsPanel({
  race,
  connected,
  teams,
  children,
}: {
  race: RaceEntry;
  connected: boolean;
  teams: Team[];
  children: ReactNode;
}) {
  const resource = useRaceInfo<RaceDetails>(
    `/races/${encodeURIComponent(race.id)}/details`,
    connected,
    "raceId",
    race.id,
  );
  const { data, error, loading } = resource;
  const [tab, setTab] = useState<DetailTab>("overview");
  const [search, setSearch] = useState("");
  const [resultId, setResultId] = useState("");
  const id = useId(),
    searchId = useId(),
    resultSelectId = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const participants = data?.participants ?? [],
    standings = data?.standings ?? [],
    results = data?.results ?? [];
  const participantTeams = useMemo(
    () =>
      new Map(
        participants.map((participant) => [
          normalize(participant.driver),
          participant.team,
        ]),
      ),
    [participants],
  );
  const teamFor = (driver: string, published = "") =>
    published ||
    participantTeams.get(normalize(driver)) ||
    resolveTeam(driver, "", teams)?.name ||
    "";
  const filteredParticipants = participants.filter((row) =>
    normalize(row.driver + (row.team ?? "") + row.car + row.number).includes(
      normalize(search),
    ),
  );
  const selectedResult =
    results.find((result) => result.id === resultId) ??
    results.find((result) => race.id.endsWith(":" + result.id)) ??
    results[0];
  const count = (value: DetailTab) =>
    !data
      ? null
      : value === "participants"
        ? participants.length
        : value === "standings"
          ? standings.length
          : value === "results"
            ? results.length
            : null;
  function tabKeys(event: KeyboardEvent<HTMLButtonElement>, index: number) {
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
    if (next === null) return;
    event.preventDefault();
    setTab(tabs[next].id);
    buttons.current[next]?.focus();
  }
  return (
    <div className="race-info">
      <div
        className="race-info-tabs"
        role="tablist"
        aria-label="Race information"
      >
        {tabs.map((item, index) => (
          <button
            key={item.id}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            id={id + "-" + item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            aria-controls={id + "-panel-" + item.id}
            tabIndex={tab === item.id ? 0 : -1}
            onClick={() => setTab(item.id)}
            onKeyDown={(event) => tabKeys(event, index)}
          >
            {item.label}
            {item.id !== "overview" && (
              <span aria-hidden={!data || undefined}>
                {count(item.id) ?? "—"}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="race-info-tools">
        <span>
          {loading ? (
            <>
              <LoaderCircle size={12} className="spin" aria-hidden="true" />
              Loading race information…
            </>
          ) : data ? (
            <>
              MKBT · Updated{" "}
              {new Date(data.updatedAt).toLocaleTimeString("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "Europe/Madrid",
              })}
            </>
          ) : (
            "Official MKBT information"
          )}
        </span>
        <Button
          onClick={() => void resource.refresh()}
          disabled={!connected || loading}
        >
          <RefreshCw
            size={13}
            className={loading ? "spin" : ""}
            aria-hidden="true"
          />
          Refresh race information
        </Button>
      </div>
      {!connected && (
        <div className="race-info-notice" role="status">
          <p>
            Connect the helper to refresh race information.
            {data ? " Showing the last loaded details." : ""}
          </p>
        </div>
      )}
      {(error || !!data?.warnings.length) && (
        <div className="race-info-notice" role="status">
          <AlertTriangle size={16} aria-hidden="true" />
          <div>
            {error && (
              <p>
                {error}
                {data ? " Showing the last loaded details." : ""}
              </p>
            )}
            {data?.warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        </div>
      )}
      {tabs
        .filter((item) => item.id !== tab)
        .map((item) => (
          <div
            key={item.id}
            id={id + "-panel-" + item.id}
            role="tabpanel"
            aria-labelledby={id + "-" + item.id}
            hidden
          />
        ))}
      <div
        id={id + "-panel-" + tab}
        className="race-info-panel"
        role="tabpanel"
        aria-labelledby={id + "-" + tab}
        tabIndex={0}
      >
        {tab === "overview" ? (
          children
        ) : loading && !data ? (
          <LoadingInfo />
        ) : !data ? (
          <EmptyState title="Race information unavailable">
            Use Refresh race information to try again, or open the official MKBT
            page from Overview.
          </EmptyState>
        ) : tab === "participants" ? (
          <>
            <div className="race-info-section-heading">
              <div>
                <h3>Registered participants</h3>
                <p>
                  {participants.length} drivers ·{" "}
                  {data.scope === "championship"
                    ? "Championship entry list"
                    : "Event entry list"}
                </p>
              </div>
              <label className="race-catalog-search" htmlFor={searchId}>
                <Search size={15} aria-hidden="true" />
                <span className="sr-only">Search participants</span>
                <input
                  id={searchId}
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Find a driver, team or car"
                />
              </label>
            </div>
            {data.scope === "championship" && (
              <p className="race-info-scope">
                These drivers are registered for the championship. Attendance
                for this individual round is confirmed on MKBT.
              </p>
            )}
            {participants.length === 0 ? (
              <EmptyState title="No participants published yet">
                MKBT has not published an entry list for this competition.
              </EmptyState>
            ) : filteredParticipants.length === 0 ? (
              <EmptyState title="No matching participants">
                Try another driver, team, car or number.
              </EmptyState>
            ) : (
              <TableRegion label="Registered participants">
                <table
                  className="race-info-table race-info-entrants results-table"
                  aria-label="Registered participants"
                >
                  <thead>
                    <tr>
                      <th scope="col">#</th>
                      <th scope="col">Driver</th>
                      <th scope="col">Team</th>
                      <th scope="col">Car</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredParticipants.map((row, index) => (
                      <tr key={row.driver + index}>
                        <td>{number(row.number)}</td>
                        <td>
                          <TeamDriver
                            driverName={row.driver}
                            teamName={teamFor(row.driver, row.team ?? "")}
                            teams={teams}
                          />
                        </td>
                        <td>{teamFor(row.driver, row.team ?? "")}</td>
                        <td>{row.car}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableRegion>
            )}
          </>
        ) : tab === "standings" ? (
          <>
            <div className="race-info-section-heading">
              <div>
                <h3>Competition standings</h3>
                <p>{standings.length} classified drivers</p>
              </div>
            </div>
            {standings.length === 0 ? (
              <EmptyState title="Standings not published yet">
                The official classification will appear when MKBT publishes
                points for this competition.
              </EmptyState>
            ) : (
              <TableRegion label="Competition standings">
                <table
                  className="race-info-table results-table"
                  aria-label="Competition standings"
                >
                  <thead>
                    <tr>
                      <th scope="col">Pos</th>
                      <th scope="col">#</th>
                      <th scope="col">Driver</th>
                      <th scope="col">Team</th>
                      <th scope="col" className="numeric">
                        Points
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {standings.map((row, index) => (
                      <tr key={row.driver + index}>
                        <td className="race-info-position">{row.position}</td>
                        <td>{number(row.number)}</td>
                        <td>
                          <TeamDriver
                            driverName={row.driver}
                            teamName={teamFor(row.driver, row.teamNames?.[0])}
                            teams={teams}
                          />
                        </td>
                        <td>
                          {row.teamNames?.filter(Boolean).join(" · ") ||
                            teamFor(row.driver)}
                        </td>
                        <td className="numeric race-info-points">
                          {row.points}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableRegion>
            )}
          </>
        ) : (
          <>
            <div className="race-info-section-heading">
              <div>
                <h3>Published race results</h3>
                <p>
                  Previous rounds and available results from this competition.
                </p>
              </div>
              {results.length > 0 && (
                <label
                  className="race-info-result-select"
                  htmlFor={resultSelectId}
                >
                  <span>Race result</span>
                  <select
                    id={resultSelectId}
                    value={selectedResult?.id ?? ""}
                    onChange={(event) => setResultId(event.target.value)}
                  >
                    {results.map((result) => (
                      <option key={result.id} value={result.id}>
                        {result.round ? result.round + " · " : ""}
                        {result.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            {selectedResult ? (
              <ResultView
                key={selectedResult.id}
                race={race}
                result={selectedResult}
                connected={connected}
                teams={teams}
                teamFor={teamFor}
              />
            ) : (
              <EmptyState title="No race results published yet">
                Results from completed rounds will appear here when MKBT
                publishes them.
              </EmptyState>
            )}
          </>
        )}
      </div>
    </div>
  );
}
