export type PortalError = { source?: string; code?: string; message: string };
export type ServerConfig = {
  id: string;
  name: string;
  host: string;
  httpPort: number;
  description?: string | null;
  allowLan?: boolean;
  liveTimingUrl?: string | null;
  embedTiming?: boolean;
};
export type Sponsor = {
  id: string;
  name: string;
  logo: string;
  url: string;
  order?: number;
};
export type PortalResponse = {
  servers: ServerConfig[];
  sponsors: Sponsor[];
  errors: (PortalError | string)[];
  fetchedAt: string;
};
export type ServerInfo = {
  name: string | null;
  track: string | null;
  currentPlayers: number | null;
  maxPlayers: number | null;
  session: number | null;
  timeLeft: number | null;
  cars: string[];
  passwordRequired: boolean | null;
};
export type ServerStatus = {
  server: ServerConfig;
  state: "online" | "offline";
  info: ServerInfo | null;
  error: { code: string; message: string } | null;
  checkedAt: string;
  joinAvailable: boolean;
};
export type ServersResponse = {
  servers: ServerStatus[];
  contentManagerAvailable: boolean;
  errors: (PortalError | string)[];
  checkedAt: string;
};
export type ServerJoinResponse = {
  serverId: string;
  launched: boolean;
  message: string;
};

export const portalErrorMessage = (error: PortalError | string) =>
  typeof error === "string" ? error : error.message;

export function httpsUrl(value?: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}
