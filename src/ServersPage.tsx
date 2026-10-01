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
  const [timingServerId, setTimingServerId] = useState("");
  const timingSelectId = useId();
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

  const join = async (entry: ServerStatus) => {
    if (!connected || !active || !entry.joinAvailable || joining) return;
    const controller = new AbortController();
    joinRequest.current = controller;
    setJoining(entry.server.id);
    setJoinMessage("");
    setJoinError("");
    try {
      const response = await api<ServerJoinResponse>(
        `/servers/${encodeURIComponent(entry.server.id)}/join`,
        {},
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      if (response.launched) {
        setJoinMessage(response.message);
      } else {
        setJoinError("Assetto Corsa could not be opened. Try again.");
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
  const timingServers = (data?.servers ?? []).filter((entry) =>
    httpsUrl(entry.server.liveTimingUrl),
  );
  const timingServer =
    timingServers.find((entry) => entry.server.id === timingServerId) ??
    timingServers[0];
  const timingUrl = httpsUrl(timingServer?.server.liveTimingUrl);

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
            Assetto Corsa must be installed and detected to open the game from here.{" "}
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
      {!!data?.servers.length && (
        <div className="servers-grid">
          {data.servers.map((entry) => {
            const info = entry.info;
            const address = entry.server.ip ?? entry.server.host ?? "";
            const session =
              info?.session == null
                ? null
                : (sessionNames[info.session] ?? `Session ${info.session}`);
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
                    onClick={() => void join(entry)}
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
      {timingServer && timingUrl && (
        <section className="live-timing-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Follow the session</p>
              <h2>Live timing</h2>
            </div>
            <a
              className="text-link"
              href={timingUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open live timing <ExternalLink size={14} />
            </a>
          </div>
          <div className="timing-server-choice">
            <label htmlFor={timingSelectId}>Server</label>
            <select
              id={timingSelectId}
              value={timingServer.server.id}
              onChange={(event) => setTimingServerId(event.target.value)}
            >
              {timingServers.map((entry) => (
                <option value={entry.server.id} key={entry.server.id}>
                  {entry.server.name}
                </option>
              ))}
            </select>
          </div>
          {timingServer.server.embedTiming ? (
            <>
              <iframe
                key={timingServer.server.id + timingUrl}
                className="live-timing-frame"
                src={timingUrl}
                title={`${timingServer.server.name} live timing`}
                sandbox="allow-scripts allow-same-origin"
                referrerPolicy="no-referrer"
                loading="lazy"
              />
              <p className="timing-help">
                If the timing view is unavailable here, use Open live timing to
                view it in a new window.
              </p>
            </>
          ) : (
            <div className="live-timing-external">
              <Timer size={26} aria-hidden="true" />
              <p>Follow {timingServer.server.name} on its live timing page.</p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
