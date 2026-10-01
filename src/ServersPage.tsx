import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowUpRight,
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

function TimingDriverCard({
  driver,
  offline,
  carImages,
  onOpen,
}: {
  driver: LiveTimingDriver;
  offline: boolean;
  carImages: ReadonlyMap<string, string>;
  onOpen: () => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const configuredImage = carImages.get(driver.carId.toLowerCase());
  const image = imageFailed ? "/images/race-action.jpg" : configuredImage ?? "/images/race-action.jpg";
  return (
    <article className="live-driver-card">
      <button
        type="button"
        className="live-driver-card-open"
        aria-label={`Open details for ${driver.name || "driver"}`}
        aria-haspopup="dialog"
        onClick={onOpen}
      />
      <div className="content-card-artwork live-driver-artwork">
        <img className="content-card-photo" src={image} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} />
        <div className="content-card-shade" aria-hidden="true" />
        <div className="live-driver-card-top">
          <span className="live-driver-number">{driver.number ? `#${driver.number}` : "Driver"}</span>
          <span className={`live-driver-status ${offline ? "offline" : "online"}`}>{offline ? "Offline" : driver.inPits ? "In pits" : "On track"}</span>
        </div>
        <div className="live-driver-card-title">
          <span className="live-driver-position">P{driver.position}</span>
          <p className="live-driver-card-name">{driver.name || "Unknown driver"}</p>
        </div>
      </div>
      <div className="live-driver-card-body">
        <p className="live-driver-car">{driver.car || "Car unavailable"}</p>
        <dl className="live-driver-card-metrics">
          <div><dt>Laps</dt><dd>{driver.laps}</dd></div>
          <div><dt>Best lap</dt><dd>{lapTime(driver.bestLapSeconds)}</dd></div>
          <div><dt>{offline ? "Last seen" : "Last lap"}</dt><dd>{offline ? (driver.lastSeen ? checkedTime(driver.lastSeen) : "—") : lapTime(driver.lastLapSeconds)}</dd></div>
        </dl>
        <span className="live-driver-details-link">View all details <ArrowUpRight size={14} aria-hidden="true" /></span>
      </div>
    </article>
  );
}

function TimingDriverGrid({
  title,
  drivers,
  offline = false,
  carImages,
  onOpen,
}: {
  title: string;
  drivers: LiveTimingDriver[];
  offline?: boolean;
  carImages: ReadonlyMap<string, string>;
  onOpen: (driver: LiveTimingDriver, offline: boolean) => void;
}) {
  return (
    <div className="live-timing-group">
      <div className="live-timing-group-heading">
        <p>{title}</p>
        <span>{drivers.length}</span>
      </div>
      {drivers.length ? (
        <div className="live-timing-driver-grid">
          {drivers.map((driver) => (
            <TimingDriverCard
              key={`${driver.position}-${driver.number}-${driver.name}`}
              driver={driver}
              offline={offline}
              carImages={carImages}
              onOpen={() => onOpen(driver, offline)}
            />
          ))}
        </div>
      ) : <p className="timing-data-empty">{offline ? "No offline drivers." : "No drivers are currently connected."}</p>}
    </div>
  );
}

function LiveTimingData({
  serverId,
  connected,
  active,
  carImages,
}: {
  serverId: string;
  connected: boolean;
  active: boolean;
  carImages: ReadonlyMap<string, string>;
}) {
  const [data, setData] = useState<LiveTimingSnapshot | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedDriver, setSelectedDriver] = useState<{ driver: LiveTimingDriver; offline: boolean } | null>(null);
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
          setError(cause instanceof Error ? cause.message : "Could not load live timing.");
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
        <span>{data ? `${data.driverCount} connected · ${data.offlineDriverCount} offline` : loading ? "Loading leaderboard…" : "Live leaderboard"}</span>
        {data && <span>{[data.session, data.track].filter(Boolean).join(" · ")}</span>}
        <Button disabled={!connected || !active || loading} onClick={() => { setLoading(true); setRefreshKey((key) => key + 1); }}>
          <RefreshCw size={13} aria-hidden="true" className={loading ? "spin" : undefined} />
          Refresh
        </Button>
      </div>
      {error && <p className="timing-data-error" role="status">{data ? "Showing the last timing update. " : ""}{error}</p>}
      {data && <>
        <TimingDriverGrid title="Connected drivers" drivers={data.drivers} carImages={carImages} onOpen={(driver, offline) => setSelectedDriver({ driver, offline })} />
        <TimingDriverGrid title="Offline drivers" drivers={data.offlineDrivers} offline carImages={carImages} onOpen={(driver, offline) => setSelectedDriver({ driver, offline })} />
      </>}
      {data && <p className="timing-data-updated">Updated {checkedTime(data.updatedAt)} · refreshes every 15 seconds</p>}
      {selectedDriver && data && (
        <Modal title={selectedDriver.driver.name || "Driver details"} onClose={() => setSelectedDriver(null)}>
          <div className="live-driver-detail">
            <p className={`live-driver-detail-status ${selectedDriver.offline ? "offline" : "online"}`}>
              {selectedDriver.offline ? "Offline" : selectedDriver.driver.inPits ? "In pits" : "On track"}
              <span>{data.session}{data.track ? ` · ${data.track}` : ""}</span>
            </p>
            <dl className="live-driver-detail-grid">
              <div><dt>Position</dt><dd>P{selectedDriver.driver.position}</dd></div>
              <div><dt>Race number</dt><dd>{selectedDriver.driver.number || "—"}</dd></div>
              <div><dt>Team</dt><dd>{selectedDriver.driver.team || "—"}</dd></div>
              <div><dt>Car</dt><dd>{selectedDriver.driver.car || "—"}</dd></div>
              <div><dt>Skin</dt><dd>{selectedDriver.driver.skin || "—"}</dd></div>
              <div><dt>Tyres</dt><dd>{selectedDriver.driver.tyres || "—"}</dd></div>
              <div><dt>Completed laps</dt><dd>{selectedDriver.driver.laps}</dd></div>
              <div><dt>Best lap</dt><dd>{lapTime(selectedDriver.driver.bestLapSeconds)}</dd></div>
              <div><dt>Last lap</dt><dd>{lapTime(selectedDriver.driver.lastLapSeconds)}</dd></div>
              <div><dt>Current split</dt><dd>{selectedDriver.driver.split || "—"}</dd></div>
              <div><dt>Ping</dt><dd>{selectedDriver.driver.ping == null ? "—" : `${selectedDriver.driver.ping} ms`}</dd></div>
              {selectedDriver.offline && <div><dt>Last seen</dt><dd>{selectedDriver.driver.lastSeen ? checkedTime(selectedDriver.driver.lastSeen) : "—"}</dd></div>}
            </dl>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function ServersPage({
  connected,
  active = true,
  carImages = new Map(),
}: {
  connected: boolean;
  active?: boolean;
  carImages?: ReadonlyMap<string, string>;
}) {
  const { data, loading, error, refresh, stale } =
    usePortalResource<ServersResponse>("/servers", connected, active, 30000);
  const [joining, setJoining] = useState<string | null>(null);
  const [joinMessage, setJoinMessage] = useState("");
  const [joinError, setJoinError] = useState("");
  const [copyError, setCopyError] = useState("");
  const [copiedAddress, setCopiedAddress] = useState("");
  const copyTimer = useRef<number | null>(null);
  const [openTimingServerId, setOpenTimingServerId] = useState<string | null>(
    null,
  );
  const [selectedCars, setSelectedCars] = useState<Record<string, string>>({});
  const carSelectId = useId();
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
        entry.server.embedTiming && httpsUrl(entry.server.liveTimingUrl) &&
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
            return (
              <article className="server-card" key={entry.server.id}>
                <div className="server-card-heading">
                  <span className="server-card-icon" aria-hidden="true">
                    <Server size={20} />
                  </span>
                  <h3>{entry.server.name}</h3>
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
                    {info.track && (
                      <div>
                        <dt>
                          <MapPin size={14} aria-hidden="true" />
                          Circuit
                        </dt>
                        <dd>{info.track.replaceAll("_", " ")}</dd>
                      </div>
                    )}
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
                <section className="server-live-timing" aria-label={`Live timing for ${entry.server.name}`}>
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
                          {apiTiming ? "Open JSON source" : "Open full view"} <ExternalLink size={13} />
                        </a>
                      </div>
                    ) : (
                      <span className="server-live-timing-hint">
                        Add liveTimingUrl in servers.json
                      </span>
                    )}
                  </div>
                  {timingUrl && apiTiming && (
                    <LiveTimingData serverId={entry.server.id} connected={connected} active={active} carImages={carImages} />
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
                {availableCars.length > 0 ? (
                  <div className="timing-server-choice server-car-choice">
                    <label htmlFor={`${carSelectId}-${entry.server.id}`}>
                      Car for this session
                    </label>
                    <select
                      id={`${carSelectId}-${entry.server.id}`}
                      value={selectedCar}
                      disabled={!!joining}
                      onChange={(event) =>
                        setSelectedCars((current) => ({
                          ...current,
                          [entry.server.id]: event.target.value,
                        }))
                      }
                    >
                      {availableCars.map((car) => (
                        <option value={car.id} key={car.id}>
                          {car.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : entry.state === "online" && info?.cars.length ? (
                  <p className="server-unavailable">
                    None of this server’s cars is installed. Install a permitted
                    car from Content to join.
                  </p>
                ) : null}
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
                      !connected || !active || !entry.joinAvailable || !!joining
                    }
                    onClick={() => void join(entry, selectedCar)}
                  >
                    <Play size={14} aria-hidden="true" />
                    {joining === entry.server.id
                      ? "Opening Assetto Corsa…"
                      : "Join server"}
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
