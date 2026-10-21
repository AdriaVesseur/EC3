import type { CSSProperties } from "react";
import type { Team } from "./portal-types";

const normalizeName = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");

export function resolveTeam(
  driverName: string,
  teamName: string,
  teams: Team[],
) {
  const timingName = normalizeName(teamName);
  if (timingName) {
    const directMatch = teams.find((team) =>
      [team.name, ...team.liveTimingNames].some(
        (name) => normalizeName(name) === timingName,
      ),
    );
    if (directMatch) return directMatch;
  }
  const driver = normalizeName(driverName);
  return driver
    ? teams.find((team) =>
        team.driverNames.some((name) => normalizeName(name) === driver),
      )
    : undefined;
}

export function TeamDriver({
  driverName,
  teamName = "",
  teams,
}: {
  driverName: string;
  teamName?: string;
  teams: Team[];
}) {
  const team = resolveTeam(driverName, teamName, teams);

  return (
    <span
      className="team-driver"
      style={
        team ? ({ "--team-color": team.color } as CSSProperties) : undefined
      }
      title={team ? `${driverName} · ${team.name}` : undefined}
    >
      <span className="team-driver-mark" aria-hidden="true">
        {team ? (
          <img
            src={team.logo}
            alt=""
            data-logo-fit={team.id === "var" ? "cover" : "contain"}
            data-logo-spacing={team.id === "srl" ? "tight" : undefined}
            loading="lazy"
            onError={(event) => {
              event.currentTarget.hidden = true;
            }}
          />
        ) : null}
        <span className="team-driver-accent" />
      </span>
      <span>{driverName}</span>
      {team ? <span className="sr-only">, {team.name}</span> : null}
    </span>
  );
}
