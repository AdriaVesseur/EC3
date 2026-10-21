import { expect, test, type Page, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { RaceCatalog, RaceEntry } from "../../src/races-types";
import type { ChampionshipResults, Snapshot } from "../../src/types";

const api = "http://127.0.0.1:32155/api";
const official = "https://www.makrobeasts.com";
const checkedAt = "2026-10-20T12:00:00Z";
const teamLogo = "https://assets.example.test/epic-racing.svg";
const firstRace: RaceEntry = {
  id: "championship:f3/2026-round-1",
  name: "Formula 3 · Barcelona",
  championship: "Formula 3 2026",
  kind: "championship",
  startAt: "2026-10-21T18:00:00Z",
  dateLabel: "21 OCT 2026",
  track: "Barcelona GP",
  car: "Tatuus F3 T-318 (2024)",
  image: null,
  url: `${official}/championships/formula-3-2026`,
  registrationUrl: `${official}/championships/formula-3-2026#registration`,
  status: "upcoming",
  registrationStatus: "open",
  registered: 36,
  capacity: 40,
  license: "Rookie",
  format: "Two races · 30 minutes",
};
const secondRace: RaceEntry = {
  ...firstRace,
  id: "event:gt3/summer-cup",
  name: "GT3 · Spa",
  championship: "MKBT Special Events",
  kind: "event",
  startAt: "2026-10-24T18:00:00Z",
  track: "Spa-Francorchamps",
  car: "GT3",
  url: `${official}/events/summer-cup`,
  registrationUrl: `${official}/events/summer-cup#registration`,
  registered: 1,
};
type Details = {
  raceId: string;
  sourceUrl: string;
  updatedAt: string;
  scope: "championship" | "event";
  participants: { number: string; driver: string; team: string; car: string }[];
  standings: ChampionshipResults["standings"];
  results: (ChampionshipResults["races"][number] & {
    resultsScope: "podium" | "full" | "unpublished";
  })[];
  warnings: string[];
};

function details(
  race: RaceEntry = firstRace,
  overrides: Partial<Details> = {},
): Details {
  const participants =
    race.id === firstRace.id
      ? Array.from({ length: 36 }, (_, index) => ({
          number: String(index + 1),
          driver:
            index === 0
              ? "Samuel Fernández"
              : index === 1
                ? "Alexandria Monteverde Fernández-Navarro"
                : `Driver ${String(index + 1).padStart(2, "0")}`,
          team:
            index === 0 ? "Epic Racing" : index === 2 ? "Unmapped Racing" : "",
          car: race.car,
        }))
      : [{ number: "71", driver: "Marta Second", team: "", car: race.car }];
  const standings = participants.map((participant, index) => ({
    position: index + 1,
    number: participant.number,
    driver: participant.driver,
    points: String(100 - index),
    teamNames: participant.team ? [participant.team] : [],
  }));
  const session = (name: string, secondRound = false) => ({
    name,
    results: participants.map((participant, index) => ({
      position: index + 1,
      number: participant.number,
      driver:
        secondRound && index === 0
          ? "Round Two Winner"
          : secondRound && index === 35
            ? "Round Two Last"
            : participant.driver,
      car: participant.car,
      time:
        index === 0
          ? "32:10.000"
          : `32:${String(10 + index).padStart(2, "0")}.600`,
    })),
  });
  return {
    raceId: race.id,
    sourceUrl: race.url,
    updatedAt: checkedAt,
    scope: race.kind,
    participants,
    standings,
    results:
      race.id === firstRace.id
        ? [
            {
              id: "round-1",
              name: "Barcelona · Round 1",
              resultsScope: "full",
              round: "R1",
              venue: "Barcelona GP",
              url: `${firstRace.url}/events/round-1/results`,
              sessions: [session("Race 1"), session("Race 2")],
            },
            {
              id: "round-2",
              name: "Monza · Round 2",
              resultsScope: "full",
              round: "R2",
              venue: "Monza",
              url: `${firstRace.url}/events/round-2/results`,
              sessions: [session("Race 1", true)],
            },
          ]
        : [],
    warnings: [],
    ...overrides,
  };
}

async function mockInformation(
  page: Page,
  respond: (
    route: Route,
    race: RaceEntry,
    refresh: boolean,
  ) => Promise<void> = (route, race) => route.fulfill({ json: details(race) }),
  respondResults: (
    route: Route,
    race: RaceEntry,
    resultId: string,
    refresh: boolean,
  ) => Promise<void> = (route, race, resultId) =>
    route.fulfill({
      json: details(race).results.find((result) => result.id === resultId),
    }),
  catalogRaces: RaceEntry[] = [firstRace, secondRace],
) {
  const calls: { id: string; url: string; refresh: boolean }[] = [];
  const catalog: RaceCatalog = {
    sourceUrl: `${official}/championships/calendar`,
    updatedAt: checkedAt,
    timeZone: "Europe/Madrid",
    races: catalogRaces,
    warnings: [],
  };
  const status: Snapshot = {
    version: "1.4.2",
    assettoPath: "C:\\Fixture\\assettocorsa",
    cspVersion: "0.2.11",
    testMode: false,
    catalog: {
      manifest: {
        championship: "Fixture",
        season: "2026",
        build: "1.4.2",
        demo: false,
        content: [],
      },
      championship: {
        minimumHelperVersion: "1.0.0",
        requiredContent: [],
        events: [],
      },
      fetchedAt: checkedAt,
    },
    catalogError: null,
    content: [],
    jobs: [],
    raceReady: { ready: false, readyCount: 0, total: 0 },
  };
  await page.clock.setFixedTime(new Date(checkedAt));
  await page.route(teamLogo, (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="20"><path fill="#16c7c7" d="M0 0h60v20H0z"/></svg>',
    }),
  );
  await page.route(`${api}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (/^\/api\/races\/[^/]+\/results\/[^/]+$/.test(url.pathname)) {
      const parts = url.pathname.split("/");
      const id = decodeURIComponent(parts[3]);
      const resultId = decodeURIComponent(parts[5]);
      const race = catalog.races.find((entry) => entry.id === id);
      expect(route.request().method()).toBe("GET");
      expect(race).toBeDefined();
      await respondResults(
        route,
        race!,
        resultId,
        url.searchParams.get("refresh") === "true",
      );
    } else if (/^\/api\/races\/[^/]+\/details$/.test(url.pathname)) {
      const id = decodeURIComponent(url.pathname.split("/")[3]);
      const race = catalog.races.find((entry) => entry.id === id);
      expect(route.request().method()).toBe("GET");
      expect(race).toBeDefined();
      const refresh = url.searchParams.get("refresh") === "true";
      calls.push({ id, url: route.request().url(), refresh });
      await respond(route, race!, refresh);
    } else if (url.pathname === "/api/races") {
      await route.fulfill({ json: catalog });
    } else if (url.pathname === "/api/session") {
      await route.fulfill({ json: { token: "race-information-fixture" } });
    } else if (url.pathname === "/api/status") {
      await route.fulfill({ json: status });
    } else if (url.pathname === "/api/portal") {
      await route.fulfill({
        json: {
          servers: [],
          sponsors: [],
          errors: [],
          fetchedAt: checkedAt,
          teams: [
            {
              id: "epic-racing",
              name: "Epic Racing",
              color: "#16c7c7",
              logo: teamLogo,
              driverNames: ["Samuel Fernández"],
              liveTimingNames: [],
            },
          ],
        },
      });
    } else if (url.pathname === "/api/helper-update") {
      await route.fulfill({
        json: {
          currentVersion: "1.4.2",
          version: "1.4.2",
          available: false,
          url: null,
          downloadUrl: null,
          notes: null,
          publishedAt: null,
          published: false,
          checkedAt,
          automaticInstall: false,
        },
      });
    } else {
      await route.fulfill({
        status: 404,
        json: { message: "Unmocked fixture request" },
      });
    }
  });
  return calls;
}

const raceDialog = (page: Page, race = firstRace) =>
  page.getByRole("dialog", { name: race.name, exact: true });
const tab = (
  page: Page,
  name: "Overview" | "Participants" | "Standings" | "Results",
  race = firstRace,
) =>
  raceDialog(page, race)
    .getByRole("tablist", { name: "Race information" })
    .getByRole("tab", { name: new RegExp(`^${name}(?:\\s*\\d+)?$`) });
async function openRace(page: Page, race = firstRace) {
  const trigger = page
    .locator(".race-catalog-row")
    .filter({ has: page.getByRole("button", { name: race.name, exact: true }) })
    .getByRole("button", { name: "Race details", exact: true });
  await trigger.click();
  await expect(raceDialog(page, race)).toBeVisible();
  return trigger;
}

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "wait" });
});

test("race information loads lazily for its encoded id and shows all participants with search and team marks", async ({
  page,
}) => {
  const calls = await mockInformation(page);
  await page.goto("/#races");
  await expect(page.locator(".race-catalog-row")).toHaveCount(2);
  expect(calls).toHaveLength(0);
  await openRace(page);
  await expect(tab(page, "Overview")).toHaveAttribute("aria-selected", "true");
  await expect(raceDialog(page)).toContainText("Barcelona GP");
  // React StrictMode may replay an aborted mount request in development.
  await expect.poll(() => calls.length).toBeGreaterThan(0);
  expect(calls[0].url).toContain(
    `/races/${encodeURIComponent(firstRace.id)}/details`,
  );
  expect(calls[0].id).toBe(firstRace.id);
  expect(calls[0].refresh).toBe(false);
  expect(calls.every((call) => call.id === firstRace.id && !call.refresh)).toBe(
    true,
  );
  await tab(page, "Participants").click();
  const table = raceDialog(page).getByRole("table", {
    name: "Registered participants",
  });
  await expect(table.getByRole("row")).toHaveCount(37);
  await expect(table.getByRole("row", { name: /Driver 36/ })).toBeVisible();
  const teamed = table.getByRole("row", { name: /Samuel Fernández/ });
  await expect(teamed).toHaveCSS("box-shadow", "none");
  await expect(
    table.getByRole("columnheader", { name: "Car", exact: true }),
  ).toHaveCSS("text-align", "left");
  await expect(teamed).toContainText("Epic Racing");
  await expect(teamed.locator(".team-driver")).toHaveAttribute(
    "style",
    "--team-color: #16c7c7;",
  );
  await expect(teamed.locator(".team-driver-mark img")).toHaveAttribute(
    "src",
    teamLogo,
  );
  await expect(table.getByRole("row", { name: /Driver 03/ })).toContainText(
    "Unmapped Racing",
  );
  const search = raceDialog(page).getByRole("searchbox", {
    name: "Search participants",
    exact: true,
  });
  await search.fill(" driver 36 ");
  await expect(table.getByRole("row")).toHaveCount(2);
  await expect(table).toContainText("Driver 36");
  await search.fill("epic racing");
  await expect(table.getByRole("row")).toHaveCount(2);
  await expect(table).toContainText("Samuel Fernández");
  await search.clear();
  await expect(table.getByRole("row")).toHaveCount(37);
});

test("standings and every published result include the full field beyond twentieth place", async ({
  page,
}) => {
  await mockInformation(page);
  await page.goto("/#races");
  await openRace(page);
  await tab(page, "Standings").click();
  const standings = raceDialog(page).getByRole("table", {
    name: "Competition standings",
  });
  await expect(standings.getByRole("row")).toHaveCount(37);
  await expect(standings.getByRole("row", { name: /Driver 36/ })).toContainText(
    "65",
  );
  await expect(
    standings.getByRole("row", { name: /Samuel Fernández/ }),
  ).toContainText("Epic Racing");
  await tab(page, "Results").click();
  const selector = raceDialog(page).getByRole("combobox", {
    name: "Race result",
    exact: true,
  });
  await expect(selector.getByRole("option")).toHaveCount(2);
  for (const name of ["Race 1", "Race 2"]) {
    const table = raceDialog(page).getByRole("table", { name, exact: true });
    await expect(table.getByRole("row")).toHaveCount(37);
    await expect(table.getByRole("row", { name: /Driver 36/ })).toBeVisible();
  }
  await selector.selectOption("round-2");
  const secondResults = raceDialog(page).getByRole("table", {
    name: "Race 1",
    exact: true,
  });
  await expect(secondResults).toContainText("Round Two Winner");
  await expect(secondResults).toContainText("Round Two Last");
  await expect(secondResults.getByRole("row")).toHaveCount(37);
  await expect(
    raceDialog(page).getByRole("table", { name: "Race 2", exact: true }),
  ).toHaveCount(0);
  await expect(
    secondResults.getByText("Samuel Fernández", { exact: true }),
  ).toHaveCount(0);
});

test("published DSQ and DNF statuses keep their labels instead of invented finishing positions", async ({
  page,
}) => {
  const result = details().results[0];
  const published = {
    ...result,
    sessions: [
      {
        name: "Race 1",
        results: [
          result.sessions[0].results[0],
          {
            position: 0,
            positionLabel: "DSQ",
            number: "2",
            driver: "Disqualified Driver",
            car: firstRace.car,
            time: "DSQ",
          },
          {
            position: 0,
            positionLabel: "DNF",
            number: "3",
            driver: "Retired Driver",
            car: firstRace.car,
            time: "DNF",
          },
        ],
      },
    ],
  };
  await mockInformation(page, (route, race) =>
    route.fulfill({ json: details(race, { results: [published] }) }),
  );
  await page.goto("/#races");
  await openRace(page);
  await tab(page, "Results").click();
  const table = raceDialog(page).getByRole("table", {
    name: "Race 1",
    exact: true,
  });
  await expect(table.getByRole("row")).toHaveCount(4);
  await expect(
    table
      .getByRole("row", { name: /Disqualified Driver/ })
      .getByRole("cell")
      .first(),
  ).toHaveText("DSQ");
  await expect(
    table
      .getByRole("row", { name: /Retired Driver/ })
      .getByRole("cell")
      .first(),
  ).toHaveText("DNF");
  await expect(table.locator("tbody tr td:first-child")).toHaveText([
    "1",
    "DSQ",
    "DNF",
  ]);
});

test("full results load only when their tab opens and preserve the entire published field", async ({
  page,
}) => {
  const full = { ...details().results[0], id: "round:1/result" };
  const preview = {
    ...full,
    resultsScope: "podium" as const,
    sessions: full.sessions.map((session) => ({
      ...session,
      results: session.results.slice(0, 3),
    })),
  };
  const requests: {
    raceId: string;
    resultId: string;
    refresh: boolean;
    url: string;
  }[] = [];
  await mockInformation(
    page,
    (route, race) =>
      route.fulfill({ json: details(race, { results: [preview] }) }),
    (route, race, resultId, refresh) => {
      requests.push({
        raceId: race.id,
        resultId,
        refresh,
        url: route.request().url(),
      });
      return route.fulfill({ json: full });
    },
  );
  await page.goto("/#races");
  await openRace(page);
  await tab(page, "Participants").click();
  await expect(
    raceDialog(page)
      .getByRole("table", { name: "Registered participants" })
      .getByRole("row"),
  ).toHaveCount(37);
  expect(requests).toHaveLength(0);
  await tab(page, "Results").click();
  const firstSession = raceDialog(page).getByRole("table", {
    name: "Race 1",
    exact: true,
  });
  await expect(firstSession.getByRole("row")).toHaveCount(37);
  await expect(firstSession).toContainText("Driver 36");
  expect(requests.length).toBeGreaterThan(0);
  expect(requests[0].raceId).toBe(firstRace.id);
  expect(requests[0].resultId).toBe(full.id);
  expect(requests[0].url).toContain(
    `/races/${encodeURIComponent(firstRace.id)}/results/${encodeURIComponent(full.id)}`,
  );
  expect(requests[0].refresh).toBe(false);
  expect(
    requests.every(
      (request) =>
        request.raceId === firstRace.id &&
        request.resultId === full.id &&
        !request.refresh,
    ),
  ).toBe(true);
  const initialRequests = requests.length;
  await raceDialog(page)
    .getByRole("button", { name: "Refresh results", exact: true })
    .click();
  await expect.poll(() => requests.length).toBeGreaterThan(initialRequests);
  expect(requests.filter((request) => request.refresh)).toHaveLength(1);
  expect(requests.at(-1)?.refresh).toBe(true);
  await expect(firstSession.getByRole("row")).toHaveCount(37);
});

test("an unavailable full result retains its labelled podium and can be retried", async ({
  page,
}) => {
  const full = details().results[0];
  const preview = {
    ...full,
    resultsScope: "podium" as const,
    sessions: full.sessions.map((session) => ({
      ...session,
      results: session.results.slice(0, 3),
    })),
  };
  let fail = true;
  await mockInformation(
    page,
    (route, race) =>
      route.fulfill({ json: details(race, { results: [preview] }) }),
    (route) =>
      fail
        ? route.fulfill({
            status: 503,
            json: { message: "Full results are temporarily unavailable." },
          })
        : route.fulfill({ json: full }),
  );
  await page.goto("/#races");
  await openRace(page);
  await tab(page, "Results").click();
  const table = raceDialog(page).getByRole("table", {
    name: "Race 1",
    exact: true,
  });
  await expect(table.getByRole("row")).toHaveCount(4);
  await expect(raceDialog(page)).toContainText(
    "Full results are temporarily unavailable.",
  );
  await expect(raceDialog(page)).toContainText("Podium preview");
  await expect(
    raceDialog(page).getByRole("link", { name: /full results/i }),
  ).toHaveAttribute("href", full.url);
  await expect(table.getByText("Driver 36", { exact: true })).toHaveCount(0);
  fail = false;
  await raceDialog(page)
    .getByRole("button", { name: "Refresh results", exact: true })
    .click();
  await expect(table.getByRole("row")).toHaveCount(37);
  await expect(raceDialog(page)).not.toContainText(
    "Full results are temporarily unavailable.",
  );
  await expect(raceDialog(page)).not.toContainText("Podium preview");
});

test("opening another race clears previous drivers while loading and refreshes the selected id only", async ({
  page,
}) => {
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const calls = await mockInformation(page, async (route, race, refresh) => {
    if (race.id === secondRace.id && !refresh) await pending;
    await route.fulfill({ json: details(race) });
  });
  await page.goto("/#races");
  await openRace(page);
  await tab(page, "Participants").click();
  await expect(
    raceDialog(page).getByRole("table", { name: "Registered participants" }),
  ).toContainText("Samuel Fernández");
  await raceDialog(page).getByRole("button", { name: "Close details" }).click();
  await openRace(page, secondRace);
  try {
    await tab(page, "Participants", secondRace).click();
    await expect(
      raceDialog(page, secondRace)
        .getByRole("status")
        .filter({ hasText: /Loading/i }),
    ).toBeVisible();
    await expect(
      raceDialog(page, secondRace).getByText("Samuel Fernández", {
        exact: true,
      }),
    ).toHaveCount(0);
  } finally {
    finish();
  }
  const table = raceDialog(page, secondRace).getByRole("table", {
    name: "Registered participants",
  });
  await expect(table).toContainText("Marta Second");
  await expect(table.getByRole("row")).toHaveCount(2);
  await raceDialog(page, secondRace)
    .getByRole("button", { name: "Refresh race information", exact: true })
    .click();
  await expect.poll(() => calls.filter((call) => call.refresh).length).toBe(1);
  expect([
    ...new Set(calls.filter((call) => !call.refresh).map((call) => call.id)),
  ]).toEqual([firstRace.id, secondRace.id]);
  expect(calls.at(-1)?.id).toBe(secondRace.id);
  expect(calls.at(-1)?.refresh).toBe(true);
  await expect(table).toContainText("Marta Second");
  await expect(
    raceDialog(page, secondRace).getByText("Samuel Fernández", { exact: true }),
  ).toHaveCount(0);
});

test("a failed information request can be retried and partial warnings retain published participants", async ({
  page,
}) => {
  let fail = true;
  const calls = await mockInformation(page, (route, race) =>
    fail
      ? route.fulfill({
          status: 503,
          json: { message: "Participant feed is temporarily unavailable." },
        })
      : route.fulfill({
          json: details(race, {
            standings: [],
            results: [],
            warnings: [
              "Standings are temporarily unavailable; the participant list is current.",
            ],
          }),
        }),
  );
  await page.goto("/#races");
  await openRace(page);
  await tab(page, "Participants").click();
  await expect(raceDialog(page)).toContainText(
    "Participant feed is temporarily unavailable.",
  );
  await expect(
    raceDialog(page).getByRole("table", { name: "Registered participants" }),
  ).toHaveCount(0);
  fail = false;
  await raceDialog(page)
    .getByRole("button", { name: "Refresh race information", exact: true })
    .click();
  await expect(
    raceDialog(page)
      .getByRole("table", { name: "Registered participants" })
      .getByRole("row"),
  ).toHaveCount(37);
  await expect(raceDialog(page)).toContainText(
    "Standings are temporarily unavailable; the participant list is current.",
  );
  await expect(raceDialog(page)).not.toContainText(
    "Participant feed is temporarily unavailable.",
  );
  expect(calls.at(-1)?.refresh).toBe(true);
});

test("a response for another race is rejected until the selected race is returned", async ({
  page,
}) => {
  let wrongRace = true;
  await mockInformation(page, (route, race) =>
    route.fulfill({ json: details(wrongRace ? secondRace : race) }),
  );
  await page.goto("/#races");
  await openRace(page);
  await tab(page, "Participants").click();
  await expect(raceDialog(page)).toContainText("unsupported race information");
  await expect(
    raceDialog(page).getByText("Marta Second", { exact: true }),
  ).toHaveCount(0);
  await expect(raceDialog(page).getByRole("table")).toHaveCount(0);
  wrongRace = false;
  await raceDialog(page)
    .getByRole("button", { name: "Refresh race information", exact: true })
    .click();
  await expect(
    raceDialog(page).getByRole("table", { name: "Registered participants" }),
  ).toContainText("Samuel Fernández");
});

test("empty published information has explicit states in each data tab", async ({
  page,
}) => {
  await mockInformation(page, (route, race) =>
    route.fulfill({
      json: details(race, { participants: [], standings: [], results: [] }),
    }),
  );
  await page.goto("/#races");
  await openRace(page);
  for (const [name, empty] of [
    ["Participants", /No.*participants/i],
    ["Standings", /Standings not published|No.*standings/i],
    ["Results", /No.*results/i],
  ] as const) {
    await tab(page, name).click();
    await expect(
      raceDialog(page).getByRole("heading", { name: empty }),
    ).toBeVisible();
    await expect(raceDialog(page).getByRole("table")).toHaveCount(0);
    await expect(
      raceDialog(page).getByRole("button", {
        name: "Refresh race information",
        exact: true,
      }),
    ).toBeEnabled();
  }
});

test("race tabs support keyboard navigation and Escape returns focus to the opening control", async ({
  page,
}) => {
  await mockInformation(page);
  await page.goto("/#races");
  const trigger = await openRace(page);
  await expect(
    raceDialog(page).getByRole("button", { name: "Close details" }),
  ).toBeFocused();
  await tab(page, "Overview").focus();
  await page.keyboard.press("ArrowRight");
  await expect(tab(page, "Participants")).toBeFocused();
  await expect(tab(page, "Participants")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.keyboard.press("End");
  await expect(tab(page, "Results")).toBeFocused();
  await expect(tab(page, "Results")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(tab(page, "Overview")).toBeFocused();
  await expect(tab(page, "Overview")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Escape");
  await expect(raceDialog(page)).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

async function geometry(page: Page) {
  const dialog = raceDialog(page);
  const box = await dialog.boundingBox();
  const tabs = await dialog
    .getByRole("tablist", { name: "Race information" })
    .boundingBox();
  const panel = await dialog.getByRole("tabpanel").boundingBox();
  const tabButtons = await dialog
    .getByRole("tablist", { name: "Race information" })
    .getByRole("tab")
    .evaluateAll((buttons) =>
      buttons.map((button) => {
        const bounds = button.getBoundingClientRect();
        return { x: bounds.x, width: bounds.width };
      }),
    );
  expect(box).not.toBeNull();
  expect(tabs).not.toBeNull();
  expect(panel).not.toBeNull();
  return { ...box!, tabsTop: tabs!.y, panelTop: panel!.y, tabButtons };
}

function expectStableGeometry(
  before: Awaited<ReturnType<typeof geometry>>,
  after: Awaited<ReturnType<typeof geometry>>,
) {
  for (const key of [
    "x",
    "y",
    "width",
    "height",
    "tabsTop",
    "panelTop",
  ] as const) {
    expect(
      Math.abs(after[key] - before[key]),
      `${key}: ${before[key]} before loading finished, ${after[key]} afterwards`,
    ).toBeLessThanOrEqual(1);
  }
  expect(after.tabButtons).toHaveLength(before.tabButtons.length);
  for (const [index, tab] of after.tabButtons.entries()) {
    expect(
      Math.abs(tab.x - before.tabButtons[index].x),
      `Tab ${index} moved horizontally when loading finished`,
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(tab.width - before.tabButtons[index].width),
      `Tab ${index} changed width when loading finished`,
    ).toBeLessThanOrEqual(1);
  }
}

for (const { width, reducedMotion } of [
  { width: 1440, reducedMotion: "no-preference" },
  { width: 900, reducedMotion: "no-preference" },
  { width: 320, reducedMotion: "reduce" },
  { width: 1440, reducedMotion: "reduce" },
] as const) {
  test(`loading completion preserves race geometry at ${width}px (${reducedMotion})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion });
    let finishDetails!: () => void;
    let finishResults!: () => void;
    const delayedDetails = new Promise<void>((resolve) => {
      finishDetails = resolve;
    });
    const delayedResults = new Promise<void>((resolve) => {
      finishResults = resolve;
    });
    const full = details().results[0];
    const preview = {
      ...full,
      resultsScope: "podium" as const,
      sessions: full.sessions.map((session) => ({
        ...session,
        results: session.results.slice(0, 3),
      })),
    };
    await mockInformation(
      page,
      async (route, race) => {
        await delayedDetails;
        await route.fulfill({ json: details(race, { results: [preview] }) });
      },
      async (route) => {
        await delayedResults;
        await route.fulfill({ json: full });
      },
    );
    await page.goto("/#races");
    await openRace(page);
    try {
      await test.step("participants loader to the full entry list", async () => {
        await tab(page, "Participants").click();
        await expect(
          raceDialog(page)
            .getByRole("status")
            .filter({ hasText: "Loading race information" }),
        ).toBeVisible();
        const before = await geometry(page);
        finishDetails();
        await expect(
          raceDialog(page)
            .getByRole("table", { name: "Registered participants" })
            .getByRole("row"),
        ).toHaveCount(37);
        const after = await geometry(page);
        expectStableGeometry(before, after);
      });
      await test.step("full results loader to every published finisher", async () => {
        await tab(page, "Results").click();
        await expect(
          raceDialog(page)
            .getByRole("status")
            .filter({ hasText: "Loading full results" }),
        ).toBeVisible();
        const before = await geometry(page);
        finishResults();
        await expect(
          raceDialog(page)
            .getByRole("table", { name: "Race 1", exact: true })
            .getByRole("row"),
        ).toHaveCount(37);
        const after = await geometry(page);
        expectStableGeometry(before, after);
      });
    } finally {
      finishDetails();
      finishResults();
    }
  });
}

for (const width of [320, 1440]) {
  test(`failed artwork preserves race dialog geometry at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({
      reducedMotion: width === 320 ? "reduce" : "no-preference",
    });
    let finishImage!: () => void;
    const delayedImage = new Promise<void>((resolve) => {
      finishImage = resolve;
    });
    const art = "https://assets.example.test/race-artwork-will-fail.png";
    await page.route(art, async (route) => {
      await delayedImage;
      await route.fulfill({ status: 404, body: "Artwork is unavailable" });
    });
    await mockInformation(page, undefined, undefined, [
      { ...firstRace, image: art },
      secondRace,
    ]);
    await page.goto("/#races");
    await openRace(page);
    try {
      await expect(
        raceDialog(page).getByRole("button", {
          name: "Refresh race information",
          exact: true,
        }),
      ).toBeEnabled();
      const artwork = raceDialog(page).locator(".race-catalog-detail-art");
      await expect(artwork.locator("img")).toHaveCount(1);
      const before = await geometry(page);
      const beforeArt = await artwork.boundingBox();
      finishImage();
      await expect(artwork).toHaveClass(/is-fallback/);
      await expect(artwork.locator("img")).toHaveCount(0);
      const after = await geometry(page);
      const afterArt = await artwork.boundingBox();
      expectStableGeometry(before, after);
      expect(beforeArt).not.toBeNull();
      expect(afterArt).not.toBeNull();
      expect(
        Math.abs(afterArt!.height - beforeArt!.height),
      ).toBeLessThanOrEqual(1);
    } finally {
      finishImage();
    }
  });
}

for (const width of [320, 900, 1440]) {
  test(`full race information fits ${width}px and passes accessibility in all data tabs`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await mockInformation(page);
    await page.goto("/#races");
    await openRace(page);
    const dialog = raceDialog(page);
    for (const name of ["Participants", "Standings", "Results"] as const) {
      await tab(page, name).click();
      await expect(dialog.getByRole("table").first()).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(
        await dialog.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true);
      const bounds = await dialog.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.width).toBeLessThanOrEqual(width);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.screenshot({
        path: `work/qa/race-information-${name.toLowerCase()}-${width}.png`,
        animations: "disabled",
      });
    }
  });
}
