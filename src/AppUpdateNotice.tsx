import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, Download, RefreshCw, X } from "lucide-react";
import { api } from "./api";
import "./app-update.css";

export type AppUpdateInfo = {
  currentVersion: string;
  version: string;
  available: boolean;
  url: string | null;
  downloadUrl: string | null;
  notes: string | null;
  publishedAt: string | null;
  published: boolean;
  checkedAt: string;
  automaticInstall: false;
};

export type AppUpdateState = {
  update: AppUpdateInfo | null;
  loading: boolean;
  error: string;
  check: () => Promise<void>;
};

const dismissedKey = "ec3-app-update-dismissed-versions";
const checkInterval = 30 * 60 * 1000;
const isGitHubLink = (value: unknown) => {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "github.com" &&
      url.port === "" &&
      url.username === "" &&
      url.password === ""
    );
  } catch {
    return false;
  }
};

function validateUpdate(value: AppUpdateInfo): AppUpdateInfo {
  if (
    !value ||
    typeof value.currentVersion !== "string" ||
    typeof value.version !== "string" ||
    typeof value.available !== "boolean" ||
    typeof value.published !== "boolean" ||
    typeof value.checkedAt !== "string" ||
    Number.isNaN(Date.parse(value.checkedAt)) ||
    value.automaticInstall !== false ||
    (value.notes !== null && typeof value.notes !== "string") ||
    (value.published &&
      (!isGitHubLink(value.url) ||
        !isGitHubLink(value.downloadUrl) ||
        typeof value.publishedAt !== "string" ||
        Number.isNaN(Date.parse(value.publishedAt)))) ||
    (!value.published &&
      (value.available ||
        value.url !== null ||
        value.downloadUrl !== null ||
        value.publishedAt !== null))
  ) {
    throw new Error(
      "The app update response could not be verified. Retry the check.",
    );
  }
  return value;
}

export function useAppUpdate(connected: boolean): AppUpdateState {
  const [update, setUpdate] = useState<AppUpdateInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef<{
    promise: Promise<void>;
    controller: AbortController;
  } | null>(null);
  const active = useRef(connected);
  active.current = connected;
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      inFlight.current?.controller.abort();
      inFlight.current = null;
    };
  }, []);

  const check = useCallback(async () => {
    if (!connected) {
      setError("Connect to the Windows app before checking for updates.");
      return;
    }
    if (inFlight.current) return inFlight.current.promise;
    setLoading(true);
    const controller = new AbortController();
    const request = (async () => {
      try {
        const next = validateUpdate(
          await api<AppUpdateInfo>("/helper-update", undefined, {
            signal: controller.signal,
          }),
        );
        if (mounted.current && active.current && !controller.signal.aborted) {
          setUpdate(next);
          setError("");
        }
      } catch (cause) {
        if (mounted.current && active.current && !controller.signal.aborted) {
          setUpdate(null);
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not check for app updates. Retry the check.",
          );
        }
      } finally {
        if (inFlight.current?.controller === controller) {
          if (mounted.current) setLoading(false);
          inFlight.current = null;
        }
      }
    })();
    inFlight.current = { promise: request, controller };
    return request;
  }, [connected]);

  useEffect(() => {
    if (!connected) {
      setLoading(false);
      return;
    }
    void check();
    const interval = window.setInterval(() => void check(), checkInterval);
    return () => {
      window.clearInterval(interval);
      inFlight.current?.controller.abort();
      inFlight.current = null;
    };
  }, [connected, check]);

  return { update, loading, error, check };
}

function readDismissed(): string[] {
  try {
    const value: unknown = JSON.parse(
      sessionStorage.getItem(dismissedKey) ?? "[]",
    );
    return Array.isArray(value)
      ? value.filter(
          (version): version is string => typeof version === "string",
        )
      : [];
  } catch {
    return [];
  }
}

export function AppUpdateNotice({
  update,
  loading,
  error,
  check,
}: AppUpdateState) {
  const [dismissed, setDismissed] = useState(readDismissed);
  if (error) {
    return (
      <section
        className="app-update-notice app-update-error"
        aria-label="App update check"
      >
        <div className="app-update-copy">
          <p className="app-update-title" role="status" aria-atomic="true">
            App update check unavailable
          </p>
          <p>{error}</p>
        </div>
        <button
          className="button app-update-action"
          type="button"
          onClick={() => void check()}
          disabled={loading}
        >
          <RefreshCw size={16} aria-hidden="true" />
          {loading ? "Checking…" : "Retry check"}
        </button>
      </section>
    );
  }
  if (!update?.available || dismissed.includes(update.version)) return null;
  const dismiss = () => {
    const next = [...dismissed, update.version];
    setDismissed(next);
    try {
      sessionStorage.setItem(dismissedKey, JSON.stringify(next));
    } catch {
      // The notice can still be dismissed when session storage is unavailable.
    }
  };
  return (
    <section className="app-update-notice" aria-label="Windows app update">
      <div className="app-update-copy">
        <p className="app-update-title" role="status" aria-atomic="true">
          Eurocup 3 app {update.version} is available
        </p>
        <p>
          You have {update.currentVersion}. Download and run the installer to
          update the Windows app.
        </p>
        <details className="app-update-notes">
          <summary>What’s new in {update.version}</summary>
          {update.notes ? (
            <pre>{update.notes}</pre>
          ) : (
            <p>Release notes are available on GitHub.</p>
          )}
          <a href={update.url!} target="_blank" rel="noopener noreferrer">
            View release on GitHub <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        </details>
      </div>
      <a
        className="button primary app-update-action"
        href={update.downloadUrl!}
        target="_blank"
        rel="noopener noreferrer"
      >
        <Download size={16} aria-hidden="true" /> Download update
      </a>
      <button
        className="app-update-dismiss"
        type="button"
        onClick={dismiss}
        aria-label={`Dismiss app update ${update.version} for this session`}
      >
        <X size={18} aria-hidden="true" />
      </button>
    </section>
  );
}
