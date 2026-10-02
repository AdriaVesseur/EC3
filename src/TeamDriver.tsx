import type { CSSProperties } from "react";
import type { Team } from "./portal-types";

const normalizeName = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");

function findTeam(driverName: string, teamName: string, teams: Team[]) {
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
  const team = findTeam(driverName, teamName, teams);
  if (!team) return <>{driverName}</>;

  return (
    <span
      className="team-driver"
      style={{ "--team-color": team.color } as CSSProperties}
      title={`${driverName} · ${team.name}`}
    >
      <span className="team-driver-mark" aria-hidden="true">
        <img
          src={team.logo}
          alt=""
          loading="lazy"
          onError={(event) => {
            event.currentTarget.hidden = true;
          }}
        />
      </span>
      <span className="team-driver-accent" aria-hidden="true" />
      <span>{driverName}</span>
      <span className="sr-only">, {team.name}</span>
    </span>
  );
}
