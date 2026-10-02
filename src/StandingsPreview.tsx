import { ArrowRight, LoaderCircle, Trophy } from "lucide-react";
import type { ChampionshipResults } from "./types";
import { TeamDriver } from "./TeamDriver";
import type { Team } from "./portal-types";

export function StandingsPreview({
  results,
  loading,
  error,
  connected,
  configured,
  teams,
}: {
  results: ChampionshipResults | null;
  loading: boolean;
  error: string;
  connected: boolean;
  configured: boolean;
  teams: Team[];
}) {
  const rows =
    results?.standings
      .slice()
      .sort((a, b) => a.position - b.position)
      .slice(0, 5) ?? [];
  return (
    <section
      className="event-panel standings-preview"
      aria-labelledby="home-standings-title"
    >
      <div className="section-heading">
        <div>
          <span className="eyebrow">LIVE FROM MAKROBEASTS</span>
          <h2 id="home-standings-title">Top 5 drivers</h2>
        </div>
        {loading ? (
          <LoaderCircle size={22} className="spin" aria-hidden="true" />
        ) : (
          <Trophy size={22} aria-hidden="true" />
        )}
      </div>
      {rows.length ? (
        <table
          className="standings-preview-table"
          aria-label="Top 5 driver standings"
        >
          <colgroup>
            <col className="preview-position-column" />
            <col />
            <col className="preview-points-column" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">Pos</th>
              <th scope="col">Driver</th>
              <th scope="col">Points</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.position}-${row.driver}`}>
                <td>
                  <span
                    className={`standing-position ${row.position <= 3 ? `p${row.position}` : ""}`}
                  >
                    {row.position.toString().padStart(2, "0")}
                  </span>
                </td>
                <td className="preview-driver">
                  <TeamDriver driverName={row.driver} teams={teams} />
                </td>
                <td className="preview-points">{row.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="standings-preview-state" role="status">
          <p>
            {!connected
              ? "Connect the helper to load driver standings."
              : !configured
                ? "The championship standings source has not been configured yet."
                : loading
                  ? "Loading driver standings…"
                  : error
                    ? "Standings are temporarily unavailable. Open Championship to try again."
                    : "No driver standings have been published yet."}
          </p>
        </div>
      )}
      <div className="standings-preview-footer">
        {results?.updatedAt && (
          <p className="standings-preview-updated">
            {!connected ? "Offline · " : ""}Updated{" "}
            {new Date(results.updatedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
            {error ? " · Last available data" : ""}
          </p>
        )}
        <a href="#championship" className="text-link">
          View full standings <ArrowRight size={15} aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}
