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
import { Badge, Button, EmptyState } from "./components";
import {
  httpsUrl,
  portalErrorMessage,
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

export function ServersPage({
  connected,
  active = true,
}: {
  connected: boolean;
  active?: boolean;
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
        entry.server.embedTiming && httpsUrl(entry.server.liveTimingUrl),
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
            const timingUrl = httpsUrl(entry.server.liveTimingUrl);
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
                <section
                  className="server-live-timing"
                  aria-labelledby={`${timingId}-heading`}
                >
                  <div className="server-live-timing-heading">
                    <div className="server-live-timing-title">
                      <Timer size={17} aria-hidden="true" />
                      <div>
                        <span>LIVE TIMING</span>
                        <h4 id={`${timingId}-heading`}>
                          {timingUrl ? "Server timing" : "Not configured"}
                        </h4>
                      </div>
                    </div>
                    {timingUrl ? (
                      <div className="server-live-timing-actions">
                        {entry.server.embedTiming && (
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
                          Open full view <ExternalLink size={13} />
                        </a>
                      </div>
                    ) : (
                      <span className="server-live-timing-hint">
                        Add liveTimingUrl in servers.json
                      </span>
                    )}
                  </div>
                  {timingUrl && entry.server.embedTiming && (
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
