import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { PortalResponse } from "./portal-types";

export function usePortalResource<T>(
  path: string,
  connected: boolean,
  active: boolean,
  pollMs: number,
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(connected && active);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const load = useCallback(
    async (force = false) => {
      if (!connected || !active || (!force && request.current)) return;
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      setLoading(true);
      try {
        const next = await api<T>(
          `${path}${force ? "?refresh=true" : ""}`,
          undefined,
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        setData(next);
        setError("");
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not refresh this information.",
          );
        }
      } finally {
        if (request.current === controller) {
          request.current = null;
          if (!controller.signal.aborted) setLoading(false);
        }
      }
    },
    [path, connected, active],
  );
  useEffect(() => {
    if (!connected || !active) {
      setLoading(false);
      return;
    }
    const refreshVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    refreshVisible();
    const interval = window.setInterval(refreshVisible, pollMs);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshVisible);
      request.current?.abort();
      request.current = null;
    };
  }, [connected, active, load, pollMs]);
  const refresh = useCallback(() => load(true), [load]);
  return {
    data,
    loading,
    error,
    refresh,
    stale: !!data && (!connected || !!error),
  };
}

export function usePortal(connected: boolean) {
  const resource = usePortalResource<PortalResponse>(
    "/portal",
    connected,
    true,
    60000,
  );
  return {
    portal: resource.data,
    loading: resource.loading,
    error: resource.error,
    refresh: resource.refresh,
  };
}
