export type FileSpec = { path: string; sha256: string; size: number };
export type Package = {
  id: string;
  name: string;
  type: "car" | "track" | "config" | "app";
  version: string;
  download: string;
  size: number;
  sha256: string;
  installPath: string;
  required: boolean;
  files: FileSpec[];
  dependencies: { id: string; minimumVersion: string }[];
  description: string;
  changelog?: string[];
  minimumCspVersion?: string;
};
export type Content = {
  package: Package;
  state: string;
  installedVersion: string | null;
  checkedFiles: number;
  invalidFiles: number;
  verifiedAt: string | null;
};
export type Job = {
  id: string;
  packageId: string;
  name: string;
  action: string;
  state: string;
  bytes: number;
  total: number;
  bytesPerSecond: number;
  checkedFiles: number;
  totalFiles: number;
  error: string | null;
  createdAt: string;
};
export type EventPackage = {
  id: string;
  name: string;
  venue: string;
  round: string;
  requiredContent: string[];
};
export type ChampionshipResults = {
  sourceUrl: string;
  updatedAt: string;
  standings: { position: number; number: string; driver: string; points: string }[];
  races: {
    id: string;
    round: string;
    name: string;
    venue: string;
    url: string;
    sessions: {
      name: string;
      results: {
        position: number;
        number: string;
        driver: string;
        car: string;
        time: string;
      }[];
    }[];
  }[];
};
export type Snapshot = {
  version: string;
  assettoPath: string | null;
  cspVersion: string | null;
  testMode: boolean;
  catalog: {
    manifest: {
      championship: string;
      season: string;
      build: string;
      demo: boolean;
      content: Package[];
    };
    championship: {
      minimumHelperVersion: string;
      resultsUrl?: string | null;
      requiredContent: string[];
      events: EventPackage[];
    };
    fetchedAt: string;
  } | null;
  catalogError: string | null;
  content: Content[];
  jobs: Job[];
  raceReady: {
    ready: boolean;
    readyCount: number;
    total: number;
    cspCompatible?: boolean;
    helperCompatible?: boolean;
    reason?: string;
  };
};
