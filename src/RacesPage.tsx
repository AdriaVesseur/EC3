import { useEffect, useId, useMemo, useState } from "react";
import { brandStorageKey } from "./brand";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Car,
  Check,
  Clock3,
  Flag,
  LayoutGrid,
  List,
  MapPin,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Star,
  Users,
  X,
} from "lucide-react";
import { Button, EmptyState, Modal } from "./components";
import { httpsUrl, type Team } from "./portal-types";
import { RaceDetailsPanel } from "./RaceDetailsPanel";
import { usePortalResource } from "./usePortal";
import type { RaceCatalog, RaceEntry } from "./races-types";
import "./races.css";

type RaceFilter = "upcoming" | "all" | "completed";
type RaceView = "grid" | "list";
const calendarUrl = "https://www.makrobeasts.com/championships/calendar";
const favouritesKey = brandStorageKey("races:favourites:v1");
const statusLabels = {
  upcoming: "Scheduled",
  completed: "Completed",
  pending: "Pending confirmation",
};
const officialUrl = (value: string | null) => {
  const safe = httpsUrl(value);
  if (!safe) return undefined;
  const url = new URL(safe);
  return ["makrobeasts.com", "www.makrobeasts.com"].includes(url.hostname) &&
    !url.port
    ? safe
    : undefined;
};
const raceTimestamp = (race: RaceEntry) => {
  const stamp = race.startAt ? Date.parse(race.startAt) : NaN;
  return Number.isFinite(stamp) ? stamp : null;
};
const entryCount = (race: RaceEntry) =>
  race.registered !== null
    ? String(race.registered) +
      (race.capacity !== null ? " / " + race.capacity : "")
    : null;
const carSummary = (race: RaceEntry) => {
  const cars = race.car.split(" · ").filter(Boolean);
  return cars.length > 2
    ? cars[0] + " + " + (cars.length - 1) + " more"
    : race.car || "Vehicles to be confirmed";
};
const registrationLabel = (race: RaceEntry) =>
  race.registrationStatus === "open"
    ? "Sign up on MKBT"
    : race.registrationStatus === "full"
      ? "View entry options"
      : "Registration on MKBT";
const favouriteKey = (race: RaceEntry) =>
  race.kind === "championship"
    ? "series:" + (race.championship || race.id)
    : race.id;
const readFavourites = () => {
  try {
    const stored: unknown = JSON.parse(
      localStorage.getItem(favouritesKey) ?? "[]",
    );
    return new Set<string>(
      Array.isArray(stored)
        ? stored
            .filter((item): item is string => typeof item === "string")
            .slice(0, 500)
        : [],
    );
  } catch {
    return new Set<string>();
  }
};

function RaceArtwork({
  race,
  className = "",
  cover = false,
}: {
  race: RaceEntry;
  className?: string;
  cover?: boolean;
}) {
  const primary = cover
    ? (httpsUrl(race.seriesImage) ?? httpsUrl(race.image))
    : httpsUrl(race.image);
  const fallback =
    cover && primary !== httpsUrl(race.image) ? httpsUrl(race.image) : null;
  const [failed, setFailed] = useState(0);
  useEffect(() => setFailed(0), [primary, fallback]);
  const image = failed === 0 ? primary : failed === 1 ? fallback : null;
  return (
    <div
      className={
        "race-catalog-art " + (!image ? "is-fallback " : "") + className
      }
      aria-hidden="true"
    >
      {image ? (
        <img
          src={image}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed((value) => value + 1)}
        />
      ) : (
        <Flag size={34} strokeWidth={1.1} />
      )}
    </div>
  );
}

function RaceDate({ race, timeZone }: { race: RaceEntry; timeZone: string }) {
  const stamp = raceTimestamp(race);
  if (stamp === null)
    return (
      <div className="race-catalog-date undated">
        <CalendarDays size={16} aria-hidden="true" />
        <span>{race.dateLabel || "Date to be confirmed"}</span>
      </div>
    );
  const date = new Date(stamp);
  return (
    <time className="race-catalog-date" dateTime={race.startAt!}>
      <CalendarDays size={16} aria-hidden="true" />
      <span>
        <strong>
          {date.toLocaleDateString("en-GB", {
            weekday: "short",
            day: "numeric",
            month: "short",
            timeZone,
          })}
        </strong>
        <b>
          {date.toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone,
          })}
        </b>
      </span>
    </time>
  );
}

function RegistrationLink({ race }: { race: RaceEntry }) {
  const url =
    race.status === "upcoming" && race.registrationStatus !== "closed"
      ? officialUrl(race.registrationUrl)
      : undefined;
  if (!url) return null;
  return (
    <a
      className={
        "button " + (race.registrationStatus === "full" ? "" : "primary")
      }
      href={url}
      target="_blank"
      rel="noopener noreferrer"
    >
      {registrationLabel(race)}
      <ArrowUpRight size={15} aria-hidden="true" />
    </a>
  );
}

function RaceCard({
  race,
  timeZone,
  favourite,
  onFavourite,
  onDetails,
}: {
  race: RaceEntry;
  timeZone: string;
  favourite: boolean;
  onFavourite: () => void;
  onDetails: () => void;
}) {
  const count = entryCount(race);
  return (
    <li className={"race-catalog-row is-" + race.status}>
      <div className="race-catalog-cover">
        <RaceArtwork race={race} cover />
        <button
          className="race-catalog-cover-open"
          type="button"
          onClick={onDetails}
          aria-label={"Preview " + race.name}
        />
        <div className="race-catalog-cover-tags">
          <span>
            {race.kind === "event" ? "SPECIAL EVENT" : "CHAMPIONSHIP"}
          </span>
          {race.license && (
            <span className="race-catalog-license">{race.license}</span>
          )}
        </div>
        <strong className="race-catalog-cover-series">
          {race.championship || race.name}
        </strong>
        <button
          className="race-catalog-favourite"
          type="button"
          aria-label={"Favourite " + (race.championship || race.name)}
          aria-pressed={favourite}
          onClick={onFavourite}
        >
          <Star
            size={17}
            fill={favourite ? "currentColor" : "none"}
            aria-hidden="true"
          />
        </button>
      </div>
      <div className="race-catalog-copy">
        <div className="race-catalog-series">
          <span>
            {race.kind === "event"
              ? "SPECIAL EVENT"
              : race.championship || "CHAMPIONSHIP ROUND"}
          </span>
          <span className={"race-catalog-status " + race.status}>
            {race.status === "completed" && (
              <Check size={11} aria-hidden="true" />
            )}
            {statusLabels[race.status]}
          </span>
        </div>
        <h2>
          <button type="button" onClick={onDetails}>
            {race.name}
          </button>
        </h2>
        <p className="race-catalog-track">
          <MapPin size={14} aria-hidden="true" />
          {race.track || "Circuit to be confirmed"}
        </p>
        <p className="race-catalog-car">
          <Car size={14} aria-hidden="true" />
          {carSummary(race)}
        </p>
        <div className="race-catalog-tags">
          {race.format && <span>{race.format}</span>}
          {race.license && <span>Min. {race.license}</span>}
        </div>
        <dl className="race-catalog-metrics">
          <div>
            <dt>Race start</dt>
            <dd>
              <RaceDate race={race} timeZone={timeZone} />
            </dd>
          </div>
          <div>
            <dt>
              {race.kind === "championship"
                ? "Series entries"
                : "Event entries"}
            </dt>
            <dd className="race-catalog-grid">
              {count ? (
                <>
                  <Users size={16} aria-hidden="true" />
                  <strong>{count}</strong>
                </>
              ) : (
                <span>See MKBT</span>
              )}
              {race.registrationStatus === "full" && <b>Full grid</b>}
            </dd>
          </div>
        </dl>
      </div>
      <div className="race-catalog-entry">
        <RegistrationLink race={race} />
        <button
          className="race-catalog-details"
          type="button"
          onClick={onDetails}
        >
          Race details
          <ArrowRight size={14} aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}

export function RacesPage({
  connected,
  active = true,
  teams = [],
}: {
  connected: boolean;
  active?: boolean;
  teams?: Team[];
}) {
  const { data, loading, error, refresh, stale } =
    usePortalResource<RaceCatalog>("/races", connected, active, 300000);
  const [filter, setFilter] = useState<RaceFilter>("upcoming");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [competition, setCompetition] = useState("all");
  const [sort, setSort] = useState("date");
  const [view, setView] = useState<RaceView>("grid");
  const [favourites, setFavourites] = useState(readFavourites);
  const [favouritesOnly, setFavouritesOnly] = useState(false);
  const [selected, setSelected] = useState<RaceEntry | null>(null);
  const searchId = useId(),
    kindId = useId(),
    competitionId = useId(),
    sortId = useId();
  const timeZone =
    data?.timeZone === "Europe/Madrid" ? data.timeZone : "Europe/Madrid";
  useEffect(() => {
    if (!active) setSelected(null);
  }, [active]);
  useEffect(() => {
    try {
      localStorage.setItem(favouritesKey, JSON.stringify([...favourites]));
    } catch {
      /* Preferences are optional. */
    }
  }, [favourites]);
  const races = data?.races ?? [];
  const counts = {
    upcoming: races.filter((race) => race.status === "upcoming").length,
    all: races.length,
    completed: races.filter((race) => race.status === "completed").length,
  };
  const competitions = [
    ...new Set(races.map((race) => race.championship).filter(Boolean)),
  ].sort();
  const sortedRaces = useMemo(
    () =>
      [...(data?.races ?? [])].sort((a, b) => {
        if (sort === "name") return a.name.localeCompare(b.name);
        const group = (race: RaceEntry) =>
          race.status === "upcoming" ? 0 : race.status === "pending" ? 1 : 2;
        if (group(a) !== group(b)) return group(a) - group(b);
        const first = raceTimestamp(a),
          second = raceTimestamp(b);
        if (first === null)
          return second === null ? a.name.localeCompare(b.name) : 1;
        if (second === null) return -1;
        return a.status === "upcoming" ? first - second : second - first;
      }),
    [data, sort],
  );
  const visible = sortedRaces.filter(
    (race) =>
      (filter === "all" || race.status === filter) &&
      (kind === "all" || race.kind === kind) &&
      (competition === "all" || race.championship === competition) &&
      (!favouritesOnly || favourites.has(favouriteKey(race))) &&
      (race.name + " " + race.championship + " " + race.track + " " + race.car)
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
  );
  const selectedCurrent = selected
    ? (races.find((race) => race.id === selected.id) ?? selected)
    : null;
  const toggleFavourite = (race: RaceEntry) =>
    setFavourites((current) => {
      const next = new Set(current),
        key = favouriteKey(race);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const resetFilters = () => {
    setFilter("all");
    setQuery("");
    setKind("all");
    setCompetition("all");
    setFavouritesOnly(false);
  };
  const narrowed =
    !!query.trim() || kind !== "all" || competition !== "all" || favouritesOnly;
  if (!active) return null;
  return (
    <section className="races-page" aria-label="MKBT race browser">
      <header className="race-catalog-header">
        <div>
          <p className="eyebrow">
            <Flag size={13} aria-hidden="true" /> MKBT RACING
          </p>
          <h1>Go Racing</h1>
          <p>Pick your race. Find your grid.</p>
        </div>
        <div className="race-catalog-header-actions">
          <span>
            <i />
            Live MKBT calendar
          </span>
          <Button
            onClick={() => void refresh()}
            disabled={!connected || loading}
          >
            <RefreshCw
              size={15}
              className={loading ? "spin" : ""}
              aria-hidden="true"
            />
            {loading ? "Refreshing…" : "Refresh races"}
          </Button>
        </div>
      </header>
      <div className="race-catalog-workspace">
        <aside className="race-catalog-sidebar" aria-label="Race filters">
          <div className="race-catalog-sidebar-title">
            <SlidersHorizontal size={15} aria-hidden="true" />
            <h2>Find a race</h2>
            {narrowed && (
              <button type="button" onClick={resetFilters}>
                Reset
              </button>
            )}
          </div>
          <div
            className="race-catalog-tabs"
            role="group"
            aria-label="Race schedule filter"
          >
            {(
              [
                ["upcoming", "Upcoming", Clock3],
                ["all", "All races", Flag],
                ["completed", "Completed", Check],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                <Icon size={16} aria-hidden="true" />
                {label}
                <span>{counts[value]}</span>
              </button>
            ))}
          </div>
          <label className="race-catalog-favourites-only">
            <input
              type="checkbox"
              checked={favouritesOnly}
              onChange={(event) => setFavouritesOnly(event.target.checked)}
            />
            <Star size={14} aria-hidden="true" /> Favourites only
          </label>
          <div className="race-catalog-filter-fields">
            <label className="race-catalog-kind" htmlFor={kindId}>
              <span>Race type</span>
              <select
                id={kindId}
                value={kind}
                onChange={(event) => setKind(event.target.value)}
              >
                <option value="all">All race types</option>
                <option value="championship">Championship rounds</option>
                <option value="event">Special events</option>
              </select>
            </label>
            <label htmlFor={competitionId}>
              <span>Competition</span>
              <select
                id={competitionId}
                value={competition}
                onChange={(event) => setCompetition(event.target.value)}
              >
                <option value="all">All competitions</option>
                {competitions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="race-catalog-sidebar-note">
            <Clock3 size={16} aria-hidden="true" />
            <p>Times in Europe/Madrid</p>
            <span>
              Sign in on MKBT to check eligibility and confirm your place.
            </span>
            <a
              href={officialUrl(data?.sourceUrl ?? null) ?? calendarUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Official calendar
              <ArrowUpRight size={13} aria-hidden="true" />
            </a>
          </div>
        </aside>
        <div className="race-catalog-content">
          <div className="race-catalog-toolbar">
            <label className="race-catalog-search" htmlFor={searchId}>
              <Search size={17} aria-hidden="true" />
              <span className="sr-only">
                Search races, series, cars or circuits
              </span>
              <input
                id={searchId}
                type="search"
                placeholder="Search a series, car or circuit"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <label className="race-catalog-sort" htmlFor={sortId}>
              <span className="sr-only">Sort races</span>
              <select
                id={sortId}
                value={sort}
                onChange={(event) => setSort(event.target.value)}
              >
                <option value="date">Start time</option>
                <option value="name">Race name A–Z</option>
              </select>
            </label>
            <div
              className="race-catalog-view"
              role="group"
              aria-label="Race display"
            >
              <button
                type="button"
                aria-label="Cards"
                aria-pressed={view === "grid"}
                onClick={() => setView("grid")}
              >
                <LayoutGrid size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="Schedule"
                aria-pressed={view === "list"}
                onClick={() => setView("list")}
              >
                <List size={19} aria-hidden="true" />
              </button>
            </div>
          </div>
          {(error || stale || !!data?.warnings.length) && (
            <div className="race-catalog-notice" role="status">
              <AlertTriangle size={18} aria-hidden="true" />
              <div>
                {error ? (
                  <p>{error}</p>
                ) : stale ? (
                  <p>
                    Showing the last loaded schedule. Reconnect the helper to
                    refresh it.
                  </p>
                ) : null}
                {data?.warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
                {data && error && (
                  <p>The last loaded races remain available below.</p>
                )}
              </div>
            </div>
          )}
          <div className="race-catalog-meta">
            <div>
              <h2>
                {favouritesOnly
                  ? "Your favourites"
                  : filter === "upcoming"
                    ? "Upcoming races"
                    : filter === "completed"
                      ? "Completed races"
                      : "All races"}
              </h2>
              {data && (
                <span aria-live="polite">
                  {visible.length} {visible.length === 1 ? "race" : "races"}
                  {query.trim() ? " matching your search" : ""}
                </span>
              )}
            </div>
            {narrowed && (
              <button type="button" onClick={resetFilters}>
                Clear filters
                <X size={13} aria-hidden="true" />
              </button>
            )}
          </div>
          {loading && !data && (
            <div className={"race-catalog-loading view-" + view} role="status">
              <span className="sr-only">Loading MKBT races…</span>
              {[0, 1, 2].map((key) => (
                <div
                  className="race-catalog-skeleton"
                  key={key}
                  aria-hidden="true"
                >
                  <i />
                  <div>
                    <i />
                    <i />
                    <i />
                  </div>
                  <i />
                </div>
              ))}
            </div>
          )}
          {data && visible.length > 0 && (
            <ol className={"race-catalog-list view-" + view}>
              {visible.map((race) => (
                <RaceCard
                  key={race.id}
                  race={race}
                  timeZone={timeZone}
                  favourite={favourites.has(favouriteKey(race))}
                  onFavourite={() => toggleFavourite(race)}
                  onDetails={() => setSelected(race)}
                />
              ))}
            </ol>
          )}
          {data && visible.length === 0 && (
            <div className="race-catalog-empty">
              <EmptyState
                title={
                  races.length === 0
                    ? "No races published"
                    : filter === "upcoming" && !narrowed
                      ? "No upcoming races announced"
                      : "No races match these filters"
                }
              >
                {races.length === 0
                  ? "Refresh the schedule or check the official MKBT calendar for announcements."
                  : "Explore the full calendar or change your search to find another race."}
              </EmptyState>
              {races.length > 0 && (
                <Button onClick={resetFilters}>Show all races</Button>
              )}
            </div>
          )}
          {!data && !loading && (
            <EmptyState
              title={
                !connected
                  ? "Connect the desktop helper"
                  : "Could not load the race calendar"
              }
            >
              {!connected
                ? "Connect the helper to browse the latest MKBT races and entry options."
                : "Try Refresh races or open the official MKBT calendar below."}
            </EmptyState>
          )}
          <div className="race-catalog-foot">
            <p>
              Sign-up opens MKBT in your browser. Log in there to confirm your
              place.
            </p>
            <a
              className="text-link"
              href={officialUrl(data?.sourceUrl ?? null) ?? calendarUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Official MKBT calendar
              <ArrowUpRight size={14} aria-hidden="true" />
            </a>
            {data && (
              <span>
                Updated{" "}
                {new Date(data.updatedAt).toLocaleTimeString("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone,
                })}
              </span>
            )}
          </div>
        </div>
      </div>
      {selectedCurrent && (
        <Modal
          title={selectedCurrent.name}
          className="race-catalog-modal"
          onClose={() => setSelected(null)}
        >
          <RaceArtwork
            race={selectedCurrent}
            className="race-catalog-detail-art"
          />
          <div className="race-catalog-detail-heading">
            <p className="eyebrow">
              {selectedCurrent.kind === "event"
                ? "MKBT SPECIAL EVENT"
                : selectedCurrent.championship}
            </p>
            <span className={`race-catalog-status ${selectedCurrent.status}`}>
              {statusLabels[selectedCurrent.status]}
            </span>
          </div>
          <RaceDetailsPanel
            race={selectedCurrent}
            connected={connected}
            teams={teams}
          >
            <dl className="race-catalog-detail-grid">
              <div>
                <dt>Date & start time</dt>
                <dd>
                  {raceTimestamp(selectedCurrent) !== null
                    ? new Date(selectedCurrent.startAt!).toLocaleString(
                        "en-GB",
                        {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          timeZone,
                        },
                      )
                    : selectedCurrent.dateLabel || "To be confirmed"}
                  <small>
                    {raceTimestamp(selectedCurrent) !== null
                      ? "Europe/Madrid"
                      : "As published by MKBT"}
                  </small>
                </dd>
              </div>
              <div>
                <dt>Circuit</dt>
                <dd>{selectedCurrent.track || "To be confirmed"}</dd>
              </div>
              <div>
                <dt>Car / class</dt>
                <dd>{selectedCurrent.car || "To be confirmed"}</dd>
              </div>
              {selectedCurrent.format && (
                <div>
                  <dt>Format</dt>
                  <dd>{selectedCurrent.format}</dd>
                </div>
              )}
              {selectedCurrent.license && (
                <div>
                  <dt>Minimum licence</dt>
                  <dd>{selectedCurrent.license}</dd>
                </div>
              )}
              {entryCount(selectedCurrent) && (
                <div>
                  <dt>
                    {selectedCurrent.kind === "championship"
                      ? "Championship entries"
                      : "Event entries"}
                  </dt>
                  <dd>
                    {entryCount(selectedCurrent)}
                    {selectedCurrent.registrationStatus === "full" && (
                      <small>Full grid · review availability on MKBT</small>
                    )}
                  </dd>
                </div>
              )}
            </dl>
            <div className="race-catalog-detail-actions">
              <RegistrationLink race={selectedCurrent} />
              {officialUrl(selectedCurrent.url) && (
                <a
                  className="button"
                  href={officialUrl(selectedCurrent.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open race page
                  <ArrowUpRight size={15} aria-hidden="true" />
                </a>
              )}
            </div>
            {selectedCurrent.status === "upcoming" &&
              selectedCurrent.registrationUrl && (
                <p className="race-catalog-signup-note">
                  Log in with your MKBT account on the official page to review
                  eligibility and confirm your entry.
                </p>
              )}
          </RaceDetailsPanel>
        </Modal>
      )}
    </section>
  );
}
