import { useEffect, useId, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  Flag,
  LockKeyhole,
  MapPin,
  Play,
  RefreshCw,
  Server,
  Timer,
  Unplug,
  UsersRound,
} from "lucide-react";
import { api } from "./api";
import { Badge, Button, EmptyState, Modal } from "./components";
import type { Package } from "./types";
import {
  httpsUrl,
  isJsonTimingUrl,
  portalErrorMessage,
  timingUrl as validateTimingUrl,
  type LiveTimingDriver,
  type LiveTimingSnapshot,
  type ServerJoinResponse,
  type ServerStatus,
  type ServersResponse,
} from "./portal-types";
import { usePortalResource } from "./usePortal";
import "./portal.css";

const sessionNames: Record<number, string> = {
  0: "Booking",
  1: "Practice",
  2: "Qualifying",
  3: "Race",
};
const checkedTime = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unavailable" : date.toLocaleString();
};
const remainingTime = (seconds: number) => {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, "0")}`;
};
const lapTime = (seconds: number | null) => {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(3).padStart(6, "0")}`;
};
const normalizeAssetId = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]/g, "");
const packagePhoto = (item: Package | undefined) =>
  item?.image || item?.icon || "/images/race-action.jpg";

function TimingDriverTable({
  title,
  drivers,
  offline = false,
}: {
  title: string;
  drivers: LiveTimingDriver[];
  offline?: boolean;
}) {
  return (
    <section className="live-timing-group" aria-label={title}>
      <div className="live-timing-group-heading">
        <h4>{title}</h4>
        <span>{drivers.length}</span>
      </div>
      {drivers.length ? (
        <div
          className="live-timing-table-wrap"
          tabIndex={0}
          aria-label={`${title} leaderboard`}
        >
          <table className="live-timing-table" aria-label={title}>
            <thead>
              <tr>
                <th>Pos</th>
                <th>No.</th>
                <th>Driver</th>
                <th>Car</th>
                <th>Laps</th>
                <th>Best</th>
                {offline ? <th>Last seen</th> : <th>Last</th>}
              </tr>
            </thead>
            <tbody>
              {drivers.map((driver) => (
                <tr key={`${driver.position}-${driver.number}-${driver.name}`}>
                  <td>{driver.position}</td>
                  <td>{driver.number || "—"}</td>
                  <td>{driver.name || "Unknown driver"}</td>
                  <td>{driver.car || "—"}</td>
                  <td>{driver.laps}</td>
                  <td>{lapTime(driver.bestLapSeconds)}</td>
                  <td>
                    {offline
                      ? driver.lastSeen
                        ? checkedTime(driver.lastSeen)
                        : "—"
                      : lapTime(driver.lastLapSeconds)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="timing-data-empty">
          {offline
            ? "No offline drivers."
            : "No drivers are currently connected."}
        </p>
      )}
    </section>
  );
}

function LiveTimingData({
  serverId,
  connected,
  active,
}: {
  serverId: string;
  connected: boolean;
  active: boolean;
}) {
  const [data, setData] = useState<LiveTimingSnapshot | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    if (!connected || !active) {
      setLoading(false);
      return;
    }
    let stopped = false;
    let request: AbortController | null = null;
    const load = async () => {
      request?.abort();
      request = new AbortController();
      try {
        const next = await api<LiveTimingSnapshot>(
          `/servers/${encodeURIComponent(serverId)}/timing`,
          undefined,
          { signal: request.signal },
        );
        if (!stopped) {
          setData(next);
          setError("");
        }
      } catch (cause) {
        if (!stopped && !request.signal.aborted) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load live timing.",
          );
        }
      } finally {
        if (!stopped && !request.signal.aborted) setLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 15000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      request?.abort();
    };
  }, [serverId, connected, active, refreshKey]);
  return (
    <div className="live-timing-data">
      <div className="live-timing-data-meta">
        <span>
          {data
            ? `${data.driverCount} connected · ${data.offlineDriverCount} offline`
            : loading
              ? "Loading leaderboard…"
              : "Live leaderboard"}
        </span>
        {data && (
          <span>{[data.session, data.track].filter(Boolean).join(" · ")}</span>
        )}
        <Button
          disabled={!connected || !active || loading}
          onClick={() => {
            setLoading(true);
            setRefreshKey((key) => key + 1);
          }}
        >
          <RefreshCw
            size={13}
            aria-hidden="true"
            className={loading ? "spin" : undefined}
          />
          Refresh
        </Button>
      </div>
      {error && (
        <p className="timing-data-error" role="status">
          {data ? "Showing the last timing update. " : ""}
          {error}
        </p>
      )}
      {data && (
        <>
          <TimingDriverTable title="Connected drivers" drivers={data.drivers} />
          <TimingDriverTable
            title="Offline drivers"
            drivers={data.offlineDrivers}
            offline
          />
        </>
      )}
      {data && (
        <p className="timing-data-updated">
          Updated {checkedTime(data.updatedAt)} · refreshes every 15 seconds
        </p>
      )}
    </div>
  );
}

export function ServersPage({
  connected,
  active = true,
  packages = [],
}: {
  connected: boolean;
  active?: boolean;
  packages?: Package[];
}) {
  const { data, loading, error, refresh, stale } =
    usePortalResource<ServersResponse>("/servers", connected, active, 30000);
  const [joining, setJoining] = useState<string | null>(null);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [joinMessage, setJoinMessage] = useState("");
  const [joinError, setJoinError] = useState("");
  const [copyError, setCopyError] = useState("");
  const [copiedAddress, setCopiedAddress] = useState("");
  const copyTimer = useRef<number | null>(null);
  const [openTimingServerId, setOpenTimingServerId] = useState<string | null>(
    null,
  );
  const [selectedCars, setSelectedCars] = useState<Record<string, string>>({});
  const timingPanelId = useId();
  const autoOpenedTiming = useRef(false);
  const joinRequest = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    },
    [],
  );
  const copyAddress = async (address: string) => {
    setCopyError("");
    try {
      await navigator.clipboard.writeText(address);
      setCopiedAddress(address);
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopiedAddress(""), 2500);
    } catch {
      setCopyError(
        "Copy is unavailable. Select the server address and copy it manually.",
      );
    }
  };
  useEffect(() => {
    if (!connected || !active) {
      joinRequest.current?.abort();
      joinRequest.current = null;
      setJoining(null);
    }
    return () => {
      joinRequest.current?.abort();
      joinRequest.current = null;
    };
  }, [connected, active]);

  useEffect(() => {
    if (!data || autoOpenedTiming.current) return;
    autoOpenedTiming.current = true;
    const firstEmbeddedTiming = data.servers.find(
      (entry) =>
        entry.server.embedTiming &&
        httpsUrl(entry.server.liveTimingUrl) &&
        !isJsonTimingUrl(entry.server.liveTimingUrl),
    );
    if (firstEmbeddedTiming)
      setOpenTimingServerId(firstEmbeddedTiming.server.id);
  }, [data]);

  const join = async (entry: ServerStatus, carId: string) => {
    if (!connected || !active || !entry.joinAvailable || joining) return;
    const controller = new AbortController();
    joinRequest.current = controller;
    setJoining(entry.server.id);
    setJoinMessage("");
    setJoinError("");
    try {
      const response = await api<ServerJoinResponse>(
        `/servers/${encodeURIComponent(entry.server.id)}/join`,
        { carId },
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      if (response.launched) {
        setJoinMessage(response.message);
      } else {
        setJoinError(
          "Assetto Corsa could not be started on the server. Try again.",
        );
      }
    } catch (cause) {
      if (!controller.signal.aborted) {
        setJoinError(
          cause instanceof Error
            ? cause.message
            : "Could not join this server.",
        );
      }
    } finally {
      if (joinRequest.current === controller) {
        joinRequest.current = null;
        if (!controller.signal.aborted) setJoining(null);
      }
    }
  };
  return (
    <div className="servers-page">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Championship servers</p>
          <h2>Choose your session</h2>
        </div>
        <Button
          disabled={!connected || !active || loading}
          onClick={() => void refresh()}
        >
          <RefreshCw size={15} className={loading ? "spin" : undefined} />
          Refresh servers
        </Button>
      </div>
      {!connected && (
        <div className="portal-notice" role="status">
          <Unplug size={18} aria-hidden="true" />
          <p>
            {data
              ? "The app is offline. Showing the last known server status. Reconnect to refresh or join."
              : "Reconnect the app to load championship servers."}
          </p>
        </div>
      )}
      {error && connected && (
        <div className="portal-notice error" role="alert">
          <AlertTriangle size={18} aria-hidden="true" />
          <p>
            {error}
            {data && " Showing the last known server status."}
          </p>
        </div>
      )}
      {data?.errors.map((problem, index) => (
        <div className="portal-notice" role="status" key={index}>
          <AlertTriangle size={18} aria-hidden="true" />
          <p>{portalErrorMessage(problem)}</p>
        </div>
      ))}
      {joinError && (
        <div className="portal-notice error" role="alert">
          <AlertTriangle size={18} aria-hidden="true" />
          <p>{joinError}</p>
        </div>
      )}
      {copyError && (
        <div className="portal-notice error" role="alert">
          <AlertTriangle size={18} aria-hidden="true" />
          <p>{copyError}</p>
        </div>
      )}
      {joinMessage && (
        <div className="portal-notice success" role="status">
          <Check size={18} aria-hidden="true" />
          <p>{joinMessage}</p>
        </div>
      )}
      {loading && !data && (
        <EmptyState title="Loading championship servers">
          Checking the latest server status…
        </EmptyState>
      )}
      {!loading && !data && connected && !error && (
        <EmptyState title="Championship servers">
          No championship servers have been published yet.
        </EmptyState>
      )}
      {data && !data.servers.length && (
        <EmptyState title="Championship servers">
          No championship servers have been published yet.
        </EmptyState>
      )}
      {!!data?.servers.length && !data.assettoCorsaAvailable && (
        <div className="portal-notice" role="status">
          <AlertTriangle size={18} aria-hidden="true" />
          <p>
            Assetto Corsa must be installed and detected to open the game from
            here.{" "}
            <a
              className="text-link"
              href="https://store.steampowered.com/app/244210/Assetto_Corsa/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Get Assetto Corsa <ExternalLink size={13} />
            </a>
          </p>
        </div>
      )}
      {!!data?.servers.length &&
        data.assettoCorsaAvailable &&
        !data.contentManagerAvailable && (
          <div className="portal-notice" role="status">
            <AlertTriangle size={18} aria-hidden="true" />
            <p>
              Content Manager’s launch protocol prepares the server session;
              Assetto Corsa then starts directly on track.{" "}
              <a
                className="text-link"
                href="https://acstuff.ru/app/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Install Content Manager <ExternalLink size={13} />
              </a>
            </p>
          </div>
        )}
      {!!data?.servers.length && (
        <div className="servers-grid">
          {data.servers.map((entry) => {
            const info = entry.info;
            const address = entry.server.ip ?? entry.server.host ?? "";
            const session =
              info?.session == null
                ? null
                : (sessionNames[info.session] ?? `Session ${info.session}`);
            const availableCars = entry.availableCars ?? [];
            const timingUrl = validateTimingUrl(entry.server.liveTimingUrl);
            const apiTiming = isJsonTimingUrl(timingUrl);
            const timingOpen = openTimingServerId === entry.server.id;
            const timingId = `${timingPanelId}-${entry.server.id}`;
            const selectedCar = availableCars.some(
              (car) => car.id === selectedCars[entry.server.id],
            )
              ? selectedCars[entry.server.id]
              : (availableCars[0]?.id ?? "");
            const trackKey = normalizeAssetId(info?.track ?? "");
            const trackPackage = packages.find(
              (item) =>
                item.type === "track" &&
                (normalizeAssetId(item.id) === trackKey ||
                  normalizeAssetId(item.name) === trackKey),
            );
            return (
              <article className="server-card" key={entry.server.id}>
                <button
                  className="server-card-cover"
                  type="button"
                  aria-haspopup="dialog"
                  aria-label={`View details for ${entry.server.name}`}
                  onClick={() => setSelectedServerId(entry.server.id)}
                >
                  <img
                    src={entry.server.image || "/images/race-action.jpg"}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    onError={(event) => {
                      event.currentTarget.src = "/images/race-action.jpg";
                    }}
                  />
                  <span
                    className="server-card-cover-shade"
                    aria-hidden="true"
                  />
                  <span className="server-card-cover-top">
                    <span className="server-card-cover-icon" aria-hidden="true">
                      <Server size={17} />
                    </span>
                    <Badge
                      state={
                        stale
                          ? "unverified"
                          : entry.state === "online"
                            ? "ready"
                            : "offline"
                      }
                    >
                      {stale ? "Last known " : ""}
                      {entry.state === "online" ? "online" : "offline"}
                    </Badge>
                  </span>
                  <span className="server-card-cover-bottom">
                    <h3>{entry.server.name}</h3>
                    <span>
                      {[
                        info?.track?.replaceAll("_", " "),
                        session,
                        info?.currentPlayers != null
                          ? `${info.currentPlayers}${info.maxPlayers != null ? ` / ${info.maxPlayers}` : ""} drivers`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") ||
                        entry.server.description ||
                        "Championship server"}
                    </span>
                    <span className="server-card-view-hint">
                      View server details{" "}
                      <ExternalLink size={13} aria-hidden="true" />
                    </span>
                  </span>
                </button>
                {selectedServerId === entry.server.id && (
                  <Modal
                    title={entry.server.name}
                    className="server-detail-modal"
                    onClose={() => setSelectedServerId(null)}
                  >
                    <div className="server-detail-options">
                      <article className="server-detail-option">
                        <div className="server-detail-option-artwork">
                          <img src={packagePhoto(trackPackage)} alt="" />
                          <span className="server-detail-option-shade" />
                          <span className="server-detail-option-copy">
                            <small>CIRCUIT</small>
                            <strong>
                              {info?.track?.replaceAll("_", " ") ||
                                "Circuit unavailable"}
                            </strong>
                            <span>{session || "Server session"}</span>
                          </span>
                        </div>
                        <div className="server-detail-option-meta">
                          <MapPin size={15} aria-hidden="true" />
                          {trackPackage?.name ?? "Track for this server"}
                        </div>
                      </article>
                      <section
                        className="server-detail-car-section"
                        aria-labelledby={`car-choice-${entry.server.id}`}
                      >
                        <div className="server-detail-section-heading">
                          <div>
                            <span>YOUR GARAGE</span>
                            <h3 id={`car-choice-${entry.server.id}`}>
                              Choose your car
                            </h3>
                          </div>
                          <span>{availableCars.length} available</span>
                        </div>
                        {availableCars.length ? (
                          <div
                            className="server-detail-car-grid"
                            role="group"
                            aria-label="Choose your car"
                          >
                            {availableCars.map((car) => {
                              const carPackage = packages.find(
                                (item) =>
                                  item.type === "car" &&
                                  item.id.toLowerCase() ===
                                    car.id.toLowerCase(),
                              );
                              return (
                                <button
                                  key={car.id}
                                  type="button"
                                  className={`server-detail-car ${selectedCar === car.id ? "selected" : ""}`}
                                  aria-label={`Select car ${car.name}`}
                                  aria-pressed={selectedCar === car.id}
                                  disabled={!!joining}
                                  onClick={() =>
                                    setSelectedCars((current) => ({
                                      ...current,
                                      [entry.server.id]: car.id,
                                    }))
                                  }
                                >
                                  <span className="server-detail-car-artwork">
                                    <img
                                      src={packagePhoto(carPackage)}
                                      alt=""
                                    />
                                  </span>
                                  <span className="server-detail-car-name">
                                    {car.name}
                                  </span>
                                  <span className="server-detail-car-id">
                                    {car.id}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="server-unavailable">
                            {entry.state === "online" && info?.cars.length
                              ? "None of this server’s cars is installed. Install a permitted car from Content to join."
                              : "The server has not published a car selection yet."}
                          </p>
                        )}
                      </section>
                    </div>
                    {address && (
                      <div className="server-address">
                        <div>
                          <span>
                            {entry.server.ip ? "Server IP" : "Server address"}
                          </span>
                          <code>{address}</code>
                          <span>HTTP port {entry.server.httpPort}</span>
                        </div>
                        <Button
                          onClick={() => void copyAddress(address)}
                          aria-label={`Copy server address ${address}`}
                        >
                          {copiedAddress === address ? (
                            <Check size={14} aria-hidden="true" />
                          ) : (
                            <Copy size={14} aria-hidden="true" />
                          )}
                          {copiedAddress === address ? "Copied" : "Copy"}
                        </Button>
                      </div>
                    )}
                    {entry.server.description && (
                      <p className="server-description">
                        {entry.server.description}
                      </p>
                    )}
                    {info ? (
                      <dl className="server-details">
                        {info.currentPlayers != null && (
                          <div>
                            <dt>
                              <UsersRound size={14} aria-hidden="true" />
                              Drivers
                            </dt>
                            <dd>
                              {info.currentPlayers}
                              {info.maxPlayers != null
                                ? ` / ${info.maxPlayers}`
                                : ""}
                            </dd>
                          </div>
                        )}
                        {session && (
                          <div>
                            <dt>
                              <Flag size={14} aria-hidden="true" />
                              Session
                            </dt>
                            <dd>{session}</dd>
                          </div>
                        )}
                        {info.timeLeft != null && (
                          <div>
                            <dt>
                              <Timer size={14} aria-hidden="true" />
                              Time remaining
                            </dt>
                            <dd>{remainingTime(info.timeLeft)}</dd>
                          </div>
                        )}
                      </dl>
                    ) : (
                      <p className="server-unavailable">
                        {entry.error?.message ??
                          "Live server details are unavailable."}
                      </p>
                    )}
                    <section
                      className="server-live-timing"
                      aria-label={`Live timing for ${entry.server.name}`}
                    >
                      <div className="server-live-timing-heading">
                        <div className="server-live-timing-title">
                          <Timer size={17} aria-hidden="true" />
                          <div>
                            <span>LIVE TIMING</span>
                            <p className="server-live-timing-name">
                              {timingUrl ? "Server timing" : "Not configured"}
                            </p>
                          </div>
                        </div>
                        {timingUrl ? (
                          <div className="server-live-timing-actions">
                            {entry.server.embedTiming && !apiTiming && (
                              <Button
                                aria-expanded={timingOpen}
                                aria-controls={timingId}
                                onClick={() =>
                                  setOpenTimingServerId((current) =>
                                    current === entry.server.id
                                      ? null
                                      : entry.server.id,
                                  )
                                }
                              >
                                {timingOpen ? "Hide timing" : "Show timing"}
                              </Button>
                            )}
                            <a
                              className="text-link"
                              href={timingUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {apiTiming
                                ? "Open JSON source"
                                : "Open full view"}{" "}
                              <ExternalLink size={13} />
                            </a>
                          </div>
                        ) : (
                          <span className="server-live-timing-hint">
                            Add liveTimingUrl in servers.json
                          </span>
                        )}
                      </div>
                      {timingUrl && apiTiming && (
                        <LiveTimingData
                          serverId={entry.server.id}
                          connected={connected}
                          active={
                            active && selectedServerId === entry.server.id
                          }
                        />
                      )}
                      {timingUrl && !apiTiming && entry.server.embedTiming && (
                        <div
                          id={timingId}
                          className="server-live-timing-frame-wrap"
                          hidden={!timingOpen}
                        >
                          {timingOpen && (
                            <>
                              <iframe
                                key={entry.server.id + timingUrl}
                                className="live-timing-frame"
                                src={timingUrl}
                                title={`${entry.server.name} live timing`}
                                sandbox="allow-scripts allow-same-origin"
                                referrerPolicy="no-referrer"
                                loading="lazy"
                              />
                              <p className="timing-help">
                                If the timing view is unavailable here, use Open
                                full view.
                              </p>
                            </>
                          )}
                        </div>
                      )}
                    </section>
                    {info?.passwordRequired && (
                      <p className="server-password">
                        <LockKeyhole size={13} />
                        Password protected
                      </p>
                    )}
                    <div className="server-card-footer">
                      <p>Last checked {checkedTime(entry.checkedAt)}</p>
                      <Button
                        variant="primary"
                        disabled={
                          !connected ||
                          !active ||
                          !entry.joinAvailable ||
                          !!joining
                        }
                        onClick={() => void join(entry, selectedCar)}
                      >
                        <Play size={14} aria-hidden="true" />
                        {joining === entry.server.id
                          ? "Opening Assetto Corsa…"
                          : "Join server"}
                      </Button>
                    </div>
                  </Modal>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
