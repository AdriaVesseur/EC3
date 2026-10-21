export type RaceEntry = {
  id: string;
  name: string;
  championship: string;
  kind: "championship" | "event";
  startAt: string | null;
  dateLabel: string;
  track: string;
  car: string;
  image: string | null;
  seriesImage?: string | null;
  url: string;
  registrationUrl: string | null;
  status: "completed" | "upcoming" | "pending";
  registrationStatus: "open" | "full" | "closed" | "unknown";
  registered: number | null;
  capacity: number | null;
  license: string | null;
  format: string | null;
};

export type RaceCatalog = {
  sourceUrl: string;
  updatedAt: string;
  timeZone: string;
  races: RaceEntry[];
  warnings: string[];
};

export type RaceParticipant = {
  number: string;
  driver: string;
  team: string | null;
  car: string;
};
export type RaceStanding = {
  position: number;
  number: string;
  driver: string;
  points: string;
  teamNames?: string[];
};
export type RaceResultRow = {
  position: number;
  positionLabel?: string | null;
  number: string;
  driver: string;
  car: string;
  time: string;
  team?: string | null;
};
export type RaceResult = {
  id: string;
  name: string;
  round: string;
  venue: string;
  url: string;
  sessions: { name: string; results: RaceResultRow[] }[];
  resultsScope: "podium" | "full" | "unpublished";
};
export type RaceDetails = {
  raceId: string;
  sourceUrl: string;
  updatedAt: string;
  scope: "championship" | "event";
  participants: RaceParticipant[];
  standings: RaceStanding[];
  results: RaceResult[];
  warnings: string[];
};
