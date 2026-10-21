import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import { brand, brandStorageKey } from "./brand";
import type { ChampionshipResults } from "./types";

export type ActiveChampionship = {
  id: string;
  name: string;
  url: string;
  image?: string | null;
  status: "active" | "upcoming";
  car?: string | null;
  registered?: number | null;
  capacity?: number | null;
  license?: string | null;
  format?: string | null;
  rounds?: number | null;
  dateLabel?: string | null;
};
export type ActiveChampionshipCatalog = {
  sourceUrl: string;
  updatedAt: string;
  championships: ActiveChampionship[];
  warnings: string[];
};

type Cached<T> = { value: T; at: number };
type ResultsState = {
  key: string;
  data: ChampionshipResults | null;
  at: number;
  loading: boolean;
  error: string;
};
const cacheMs = 5 * 60 * 1000;
const maxResults = 24;
const catalogKey = brandStorageKey("active-championships:v1");
const selectionKey = brandStorageKey("active-championship:v1");
const resultsIndexKey = brandStorageKey("championship-results:index:v1");
const resultsStorageKey = (id: string) =>
  brandStorageKey(`championship-results:${id}:v1`);
const resultsMemory = new Map<string, Cached<ChampionshipResults>>();
let catalogMemory: Cached<ActiveChampionshipCatalog> | null = null;
const emptyResults: ResultsState = {
  key: "",
  data: null,
  at: 0,
  loading: false,
  error: "",
};

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string";
const validId = (value: unknown): value is string =>
  text(value) && /^[a-z0-9][a-z0-9-]{0,149}$/.test(value);
const validDate = (value: unknown): value is string =>
  text(value) && Number.isFinite(Date.parse(value));
const fresh = (at: number) => {
  const age = Date.now() - at;
  return age >= 0 && age < cacheMs;
};

// Ignore fragments, query strings and the site's optional www prefix when
// checking identity. A cached Formula 3 response must never fill another series.
function championshipSource(value: unknown): string | null {
  if (!text(value)) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      !["makrobeasts.com", "www.makrobeasts.com"].includes(url.hostname) ||
      url.username ||
      url.password ||
      url.port
    )
      return null;
    const path = url.pathname.replace(/\/+$/, "");
    if (!/^\/championships\/[a-z0-9][a-z0-9-]{0,149}$/.test(path)) return null;
    return `https://www.makrobeasts.com${path}`;
  } catch {
    return null;
  }
}

function validCatalog(value: unknown): value is ActiveChampionshipCatalog {
  if (
    !object(value) ||
    !text(value.sourceUrl) ||
    !validDate(value.updatedAt) ||
    !Array.isArray(value.championships) ||
    value.championships.length > 100 ||
    !Array.isArray(value.warnings) ||
    !value.warnings.every(text)
  )
    return false;
  const ids = new Set<string>();
  return value.championships.every((entry: unknown) => {
    if (
      !object(entry) ||
      !validId(entry.id) ||
      !text(entry.name) ||
      !entry.name.trim() ||
      entry.name.length > 300 ||
      championshipSource(entry.url) !==
        `https://www.makrobeasts.com/championships/${entry.id}` ||
      (entry.status !== "active" && entry.status !== "upcoming") ||
      (entry.image != null && !text(entry.image)) ||
      ["car", "license", "format", "dateLabel"].some(
        (field) => entry[field] != null && !text(entry[field]),
      ) ||
      ["registered", "capacity", "rounds"].some(
        (field) =>
          entry[field] != null &&
          (typeof entry[field] !== "number" ||
            !Number.isFinite(entry[field]) ||
            (entry[field] as number) < 0),
      ) ||
      ids.has(entry.id)
    )
      return false;
    ids.add(entry.id);
    return true;
  });
}

function validResults(
  value: unknown,
  expectedUrl: string,
): value is ChampionshipResults {
  if (
    !object(value) ||
    !championshipSource(expectedUrl) ||
    championshipSource(value.sourceUrl) !== championshipSource(expectedUrl) ||
    !validDate(value.updatedAt) ||
    !Array.isArray(value.standings) ||
    !Array.isArray(value.races) ||
    value.standings.length > 2000 ||
    value.races.length > 100
  )
    return false;
  return (
    value.standings.every(
      (row: unknown) =>
        object(row) &&
        typeof row.position === "number" &&
        Number.isFinite(row.position) &&
        text(row.number) &&
        text(row.driver) &&
        text(row.points) &&
        (row.teamNames == null ||
          (Array.isArray(row.teamNames) && row.teamNames.every(text))),
    ) &&
    value.races.every(
      (race: unknown) =>
        object(race) &&
        text(race.id) &&
        text(race.round) &&
        text(race.name) &&
        text(race.venue) &&
        text(race.url) &&
        Array.isArray(race.sessions) &&
        race.sessions.length <= 30 &&
        race.sessions.every(
          (session: unknown) =>
            object(session) &&
            text(session.name) &&
            Array.isArray(session.results) &&
            session.results.length <= 2000 &&
            session.results.every(
              (row: unknown) =>
                object(row) &&
                typeof row.position === "number" &&
                Number.isFinite(row.position) &&
                text(row.number) &&
                text(row.driver) &&
                text(row.car) &&
                text(row.time),
            ),
        ),
    )
  );
}

function readStorage(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw && raw.length <= 5_000_000 ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writeStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Optional cache. */
  }
}
function cached<T>(
  value: unknown,
  validate: (item: unknown) => item is T,
): Cached<T> | null {
  return object(value) &&
    typeof value.at === "number" &&
    Number.isFinite(value.at) &&
    value.at > 0 &&
    validate(value.value)
    ? { value: value.value, at: value.at }
    : null;
}
function readCatalog() {
  catalogMemory ??= cached(readStorage(catalogKey), validCatalog);
  return catalogMemory;
}
function rememberResults(id: string, entry: Cached<ChampionshipResults>) {
  resultsMemory.delete(id);
  resultsMemory.set(id, entry);
  while (resultsMemory.size > maxResults)
    resultsMemory.delete(resultsMemory.keys().next().value!);
}
function readResults(id: string, url: string) {
  const memory = resultsMemory.get(id);
  if (memory && validResults(memory.value, url)) return memory;
  const stored = cached(
    readStorage(resultsStorageKey(id)),
    (value): value is ChampionshipResults => validResults(value, url),
  );
  if (stored) rememberResults(id, stored);
  return stored;
}
function saveResults(id: string, entry: Cached<ChampionshipResults>) {
  rememberResults(id, entry);
  const previous = readStorage(resultsIndexKey);
  const ids = [
    id,
    ...(Array.isArray(previous) ? previous.filter(validId) : []),
  ].filter((value, index, all) => all.indexOf(value) === index);
  try {
    for (const expired of ids.slice(maxResults))
      localStorage.removeItem(resultsStorageKey(expired));
  } catch {
    /* Storage can be disabled without disabling the launcher. */
  }
  writeStorage(resultsStorageKey(id), entry);
  writeStorage(resultsIndexKey, ids.slice(0, maxResults));
}
function previousSelection() {
  const stored = readStorage(selectionKey);
  return validId(stored) ? stored : "";
}
const message = (cause: unknown, fallback: string) =>
  cause instanceof Error ? cause.message : fallback;

export function useActiveChampionships(connected: boolean, enabled: boolean) {
  const active = enabled && brand.id === "mkbt";
  const [catalogState, setCatalogState] = useState(() => ({
    data: brand.id === "mkbt" ? (readCatalog()?.value ?? null) : null,
    loading: active && connected && !readCatalog(),
    error: "",
  }));
  const [selectedId, setSelectedId] = useState(previousSelection);
  const [resultState, setResultState] = useState<ResultsState>(emptyResults);
  const catalogRequest = useRef<AbortController | null>(null);
  const resultRequest = useRef<AbortController | null>(null);
  const catalog = catalogState.data;
  const selected =
    catalog?.championships.find((entry) => entry.id === selectedId) ??
    catalog?.championships[0] ??
    null;
  const id = selected?.id ?? "";
  const url = selected?.url ?? "";
  const key = id ? `${id}:${championshipSource(url)}` : "";
  const selectedCache = useMemo(
    () => (id ? readResults(id, url) : null),
    [id, url],
  );

  useEffect(() => {
    if (!catalog) return;
    if (selectedId !== id) {
      // A user may choose a series before this passive effect reconciles the
      // catalog's initial fallback. Preserve any newer selection in the queue.
      setSelectedId((current) => (current === selectedId ? id : current));
      return;
    }
    writeStorage(selectionKey, id);
  }, [catalog, id, selectedId]);

  const select = useCallback(
    (nextId: string) => {
      if (
        nextId === id ||
        !catalog?.championships.some((entry) => entry.id === nextId)
      )
        return;
      resultRequest.current?.abort();
      resultRequest.current = null;
      setSelectedId(nextId);
      writeStorage(selectionKey, nextId);
    },
    [catalog, id],
  );

  const loadCatalog = useCallback(
    async (force = false) => {
      if (!connected || !active) return;
      if (!force && catalogRequest.current) return;
      const previous = readCatalog();
      if (!force && previous && fresh(previous.at)) {
        setCatalogState((state) => ({
          ...state,
          data: previous.value,
          loading: false,
        }));
        return;
      }
      catalogRequest.current?.abort();
      const controller = new AbortController();
      catalogRequest.current = controller;
      setCatalogState((state) => ({ ...state, loading: true, error: "" }));
      try {
        const next = await api<unknown>(
          `/championships${force ? "?refresh=true" : ""}`,
          undefined,
          { signal: controller.signal },
        );
        if (controller.signal.aborted || catalogRequest.current !== controller)
          return;
        if (!validCatalog(next))
          throw new Error(
            "MKBT returned an unsupported championship list. Please refresh.",
          );
        catalogMemory = { value: next, at: Date.now() };
        writeStorage(catalogKey, catalogMemory);
        setCatalogState({ data: next, loading: false, error: "" });
      } catch (cause) {
        if (!controller.signal.aborted && catalogRequest.current === controller)
          setCatalogState((state) => ({
            ...state,
            loading: false,
            error: message(
              cause,
              "Could not load active championships. Please retry.",
            ),
          }));
      } finally {
        if (catalogRequest.current === controller)
          catalogRequest.current = null;
      }
    },
    [connected, active],
  );

  const loadResults = useCallback(
    async (force = false) => {
      if (!connected || !active || !id || !key) return;
      if (!force && resultRequest.current) return;
      const previous = readResults(id, url);
      if (!force && previous && fresh(previous.at)) {
        setResultState((state) => ({
          key,
          data: previous.value,
          at: previous.at,
          loading: false,
          error: state.key === key ? state.error : "",
        }));
        return;
      }
      resultRequest.current?.abort();
      const controller = new AbortController();
      resultRequest.current = controller;
      setResultState({
        key,
        data: previous?.value ?? null,
        at: previous?.at ?? 0,
        loading: true,
        error: "",
      });
      try {
        const next = await api<unknown>(
          `/championships/${encodeURIComponent(id)}/results${force ? "?refresh=true" : ""}`,
          undefined,
          { signal: controller.signal },
        );
        if (controller.signal.aborted || resultRequest.current !== controller)
          return;
        if (!validResults(next, url))
          throw new Error(
            "MKBT returned results for an unsupported or different championship. Please refresh.",
          );
        const entry = { value: next, at: Date.now() };
        saveResults(id, entry);
        setResultState({
          key,
          data: next,
          at: entry.at,
          loading: false,
          error: "",
        });
      } catch (cause) {
        if (!controller.signal.aborted && resultRequest.current === controller)
          setResultState({
            key,
            data: previous?.value ?? null,
            at: previous?.at ?? 0,
            loading: false,
            error: message(
              cause,
              "Could not load this championship. Please retry.",
            ),
          });
      } finally {
        if (resultRequest.current === controller) resultRequest.current = null;
      }
    },
    [connected, active, id, url, key],
  );

  useEffect(() => {
    if (!connected || !active) return;
    void loadCatalog();
    const visible = () => {
      if (document.visibilityState === "visible") void loadCatalog();
    };
    const interval = window.setInterval(visible, cacheMs);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", visible);
      catalogRequest.current?.abort();
      catalogRequest.current = null;
    };
  }, [connected, active, loadCatalog]);

  useEffect(() => {
    if (!connected || !active || !id) return;
    void loadResults();
    const visible = () => {
      if (document.visibilityState === "visible") void loadResults();
    };
    const interval = window.setInterval(visible, cacheMs);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", visible);
      resultRequest.current?.abort();
      resultRequest.current = null;
    };
  }, [connected, active, id, loadResults]);

  const current =
    resultState.key === key
      ? resultState
      : {
          key,
          data: selectedCache?.value ?? null,
          at: selectedCache?.at ?? 0,
          loading: !!(
            active &&
            connected &&
            id &&
            (!selectedCache || !fresh(selectedCache.at))
          ),
          error: "",
        };
  const refreshCatalog = useCallback(() => loadCatalog(true), [loadCatalog]);
  const refreshResults = useCallback(() => loadResults(true), [loadResults]);
  return {
    catalog,
    selected,
    select,
    results: current.data,
    loading: active && connected && current.loading,
    error: current.error,
    catalogLoading:
      active &&
      connected &&
      (catalogState.loading || (!catalog && !catalogState.error)),
    catalogError: catalogState.error,
    refreshCatalog,
    refreshResults,
    stale:
      !!current.data && (!connected || !!current.error || !fresh(current.at)),
  };
}
