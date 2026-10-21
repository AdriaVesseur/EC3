import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  LoaderCircle,
  RefreshCw,
  Search,
} from "lucide-react";
import { api } from "./api";
import { Button, EmptyState } from "./components";
import { resolveTeam, TeamDriver } from "./TeamDriver";
import type { Team } from "./portal-types";
import type { ActiveChampionship } from "./useActiveChampionships";
import "./ChampionshipOverview.css";

type ChampionshipParticipant = {
  number: string;
  driver: string;
  team: string | null;
  car: string;
};
type ChampionshipRound = {
  id: string;
  name: string;
  track: string;
  dateLabel: string;
  startAt: string | null;
  status: string;
};
type ChampionshipDetails = {
  championshipId: string;
  sourceUrl: string;
  updatedAt: string;
  description: string | null;
  participants: ChampionshipParticipant[];
  calendar: ChampionshipRound[];
  warnings: string[];
};
type Cached = { value: ChampionshipDetails; at: number };
type Resource = {
  key: string;
  data: ChampionshipDetails | null;
  loading: boolean;
  error: string;
};
const detailsCache = new Map<string, Cached>();
const cacheMs = 5 * 60 * 1000;
const text = (value: unknown): value is string => typeof value === "string";
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const validDate = (value: unknown): value is string =>
  text(value) && Number.isFinite(Date.parse(value));
const fresh = (at: number) => {
  const age = Date.now() - at;
  return age >= 0 && age < cacheMs;
};
function source(value: unknown, id: string) {
  if (!text(value)) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      ["makrobeasts.com", "www.makrobeasts.com"].includes(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.port &&
      url.pathname.replace(/\/+$/, "") === `/championships/${id}`
      ? `https://www.makrobeasts.com/championships/${id}`
      : null;
  } catch {
    return null;
  }
}
function validDetails(
  value: unknown,
  championship: Pick<ActiveChampionship, "id" | "url">,
): value is ChampionshipDetails {
  const expectedSource = source(championship.url, championship.id);
  return (
    object(value) &&
    value.championshipId === championship.id &&
    !!expectedSource &&
    source(value.sourceUrl, championship.id) === expectedSource &&
    validDate(value.updatedAt) &&
    (value.description == null || text(value.description)) &&
    Array.isArray(value.participants) &&
    value.participants.length <= 2000 &&
    value.participants.every(
      (row: unknown) =>
        object(row) &&
        text(row.number) &&
        text(row.driver) &&
        (row.team == null || text(row.team)) &&
        text(row.car),
    ) &&
    Array.isArray(value.calendar) &&
    value.calendar.length <= 200 &&
    value.calendar.every(
      (row: unknown) =>
        object(row) &&
        text(row.id) &&
        text(row.name) &&
        text(row.track) &&
        text(row.dateLabel) &&
        (row.startAt == null || validDate(row.startAt)) &&
        text(row.status),
    ) &&
    Array.isArray(value.warnings) &&
    value.warnings.length <= 100 &&
    value.warnings.every(text)
  );
}
function useChampionshipDetails(
  championship: ActiveChampionship,
  connected: boolean,
) {
  const { id, url } = championship;
  const key = `${id}:${source(url, id) ?? "unsupported"}`;
  const request = useRef<AbortController | null>(null);
  const [state, setState] = useState<Resource>(() => ({
    key,
    data: detailsCache.get(key)?.value ?? null,
    loading: connected && !fresh(detailsCache.get(key)?.at ?? 0),
    error: "",
  }));
  const load = useCallback(
    async (force = false) => {
      request.current?.abort();
      request.current = null;
      const cached = detailsCache.get(key);
      const previous = cached?.value ?? null;
      if (!connected || (!force && cached && fresh(cached.at))) {
        setState({ key, data: previous, loading: false, error: "" });
        return;
      }
      const controller = new AbortController();
      request.current = controller;
      setState({ key, data: previous, loading: true, error: "" });
      try {
        const next = await api<unknown>(
          `/championships/${encodeURIComponent(id)}/details${force ? "?refresh=true" : ""}`,
          undefined,
          { signal: controller.signal },
        );
        if (controller.signal.aborted || request.current !== controller) return;
        if (!validDetails(next, { id, url }))
          throw new Error(
            "MKBT returned unsupported information for this championship. Refresh or open the official championship page.",
          );
        detailsCache.delete(key);
        detailsCache.set(key, { value: next, at: Date.now() });
        while (detailsCache.size > 24)
          detailsCache.delete(detailsCache.keys().next().value!);
        setState({ key, data: next, loading: false, error: "" });
      } catch (cause) {
        if (controller.signal.aborted || request.current !== controller) return;
        setState({
          key,
          data: previous,
          loading: false,
          error:
            cause instanceof Error
              ? cause.message
              : "Could not load championship information. Try refreshing or open the official page.",
        });
      } finally {
        if (request.current === controller) request.current = null;
      }
    },
    [connected, id, url, key],
  );
  useEffect(() => {
    void load();
    return () => {
      request.current?.abort();
      request.current = null;
    };
  }, [load]);
  const cached = detailsCache.get(key);
  const current =
    state.key === key
      ? state
      : {
          key,
          data: cached?.value ?? null,
          loading: connected && !(cached && fresh(cached.at)),
          error: "",
        };
  return { ...current, refresh: () => load(true) };
}
const normalize = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
const number = (value: string) =>
  !value || value === "—" ? "—" : value.startsWith("#") ? value : `#${value}`;
const roundStatuses: Record<string, string> = {
  upcoming: "Upcoming",
  active: "In progress",
  ongoing: "In progress",
  completed: "Completed",
  pending: "To be confirmed",
  cancelled: "Cancelled",
};
const roundStatus = (status: string) =>
  roundStatuses[status] ?? status.replaceAll("-", " ");
function roundDate(round: ChampionshipRound) {
  if (round.dateLabel.trim()) return round.dateLabel;
  return round.startAt
    ? new Date(round.startAt).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Madrid",
      })
    : "Date to be confirmed";
}

export function ChampionshipOverview({
  championship,
  connected,
  teams,
}: {
  championship: ActiveChampionship;
  connected: boolean;
  teams: Team[];
}) {
  const resource = useChampionshipDetails(championship, connected);
  const { data, loading, error } = resource;
  const [search, setSearch] = useState("");
  const searchId = useId();
  const scheduleId = useId();
  const participantsId = useId();
  const published = championship;
  const teamFor = (row: ChampionshipParticipant) =>
    row.team || resolveTeam(row.driver, "", teams)?.name || "";
  const participants = useMemo(() => {
    const query = normalize(search);
    return (data?.participants ?? []).filter((row) =>
      normalize(
        row.driver +
          (row.team || resolveTeam(row.driver, "", teams)?.name || "") +
          row.car +
          row.number,
      ).includes(query),
    );
  }, [data, search, teams]);
  useEffect(() => setSearch(""), [championship.id]);
  const url = source(championship.url, championship.id);
  const registered =
    published.registered ??
    (data?.participants.length ? data.participants.length : null);
  return (
    <div className="championship-overview race-info">
      <div className="race-info-tools">
        <span role="status">
          {loading ? (
            <>
              <LoaderCircle size={12} className="spin" aria-hidden="true" />
              Loading championship information…
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
          Refresh championship information
        </Button>
      </div>
      {!connected && (
        <div className="race-info-notice" role="status">
          <p>
            Connect the helper to refresh championship information.
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
            {data?.warnings.map((warning, index) => (
              <p key={warning + index}>{warning}</p>
            ))}
          </div>
        </div>
      )}
      <dl className="race-catalog-detail-grid">
        <div>
          <dt>Status</dt>
          <dd>
            {championship.status === "active" ? "In progress" : "Upcoming"}
          </dd>
        </div>
        {published.car && (
          <div>
            <dt>Car</dt>
            <dd>{published.car}</dd>
          </div>
        )}
        {registered != null && (
          <div>
            <dt>Registered drivers</dt>
            <dd>
              {registered}
              {published.capacity != null ? ` / ${published.capacity}` : ""}
            </dd>
          </div>
        )}
        {published.license && (
          <div>
            <dt>License</dt>
            <dd>{published.license}</dd>
          </div>
        )}
        {published.format && (
          <div>
            <dt>Race format</dt>
            <dd>{published.format}</dd>
          </div>
        )}
        {published.rounds != null && (
          <div>
            <dt>Rounds</dt>
            <dd>{published.rounds}</dd>
          </div>
        )}
        {published.dateLabel && (
          <div>
            <dt>Dates</dt>
            <dd>{published.dateLabel}</dd>
          </div>
        )}
      </dl>
      {data?.description?.trim() && (
        <p className="championship-overview-description">{data.description}</p>
      )}
      {url && (
        <div className="race-catalog-detail-actions">
          <a
            className="button"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open official championship
            <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        </div>
      )}
      {loading && !data ? (
        <div className="race-info-loading" role="status">
          <LoaderCircle size={20} className="spin" aria-hidden="true" />
          <span>Loading schedule and participants…</span>
        </div>
      ) : !data ? (
        <EmptyState title="Championship information unavailable">
          Use Refresh championship information to try again, or open the
          official MKBT championship page.
        </EmptyState>
      ) : (
        <>
          <section
            className="championship-overview-section"
            aria-labelledby={scheduleId}
          >
            <div className="race-info-section-heading">
              <div>
                <h3 id={scheduleId}>Championship schedule</h3>
                <p>{data.calendar.length} published rounds · MKBT calendar</p>
              </div>
            </div>
            {data.calendar.length === 0 ? (
              <EmptyState title="Schedule not published yet">
                The championship calendar will appear when MKBT publishes it.
              </EmptyState>
            ) : (
              <ol className="championship-overview-calendar">
                {data.calendar.map((round, index) => (
                  <li key={round.id + index}>
                    <CalendarDays size={17} aria-hidden="true" />
                    <div>
                      <strong>{round.name}</strong>
                      {round.track && <span>{round.track}</span>}
                    </div>
                    <div className="championship-overview-round-date">
                      {round.startAt ? (
                        <time dateTime={round.startAt}>{roundDate(round)}</time>
                      ) : (
                        <span>{roundDate(round)}</span>
                      )}
                      {round.status && (
                        <small>{roundStatus(round.status)}</small>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
          <section
            className="championship-overview-section"
            aria-labelledby={participantsId}
          >
            <div className="race-info-section-heading">
              <div>
                <h3 id={participantsId}>Registered participants</h3>
                <p>
                  {data.participants.length} drivers · Championship entry list
                </p>
              </div>
              {data.participants.length > 0 && (
                <label className="race-catalog-search" htmlFor={searchId}>
                  <Search size={15} aria-hidden="true" />
                  <span className="sr-only">
                    Search championship participants
                  </span>
                  <input
                    id={searchId}
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Find a driver, team or car"
                  />
                </label>
              )}
            </div>
            {data.participants.length === 0 ? (
              <EmptyState title="No participants published yet">
                MKBT has not published an entry list for this championship.
              </EmptyState>
            ) : participants.length === 0 ? (
              <EmptyState title="No matching participants">
                Try another driver, team, car or number.
              </EmptyState>
            ) : (
              <div
                className="race-info-table-wrap"
                role="region"
                aria-label="Registered championship participants table"
                tabIndex={0}
              >
                <table
                  className="race-info-table race-info-entrants results-table"
                  aria-label="Registered championship participants"
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
                    {participants.map((row, index) => (
                      <tr key={row.driver + index}>
                        <td>{number(row.number)}</td>
                        <td>
                          <TeamDriver
                            driverName={row.driver}
                            teamName={teamFor(row)}
                            teams={
                              row.team && !resolveTeam("", row.team, teams)
                                ? []
                                : teams
                            }
                          />
                        </td>
                        <td>{teamFor(row)}</td>
                        <td>{row.car}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
