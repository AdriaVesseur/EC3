import { expect, test, type Page, type Route } from "@playwright/test";
import type { ChampionshipResults, Snapshot } from "../../src/types";

type BrandId = "mkbt" | "epic";
const checkedAt = "2026-10-21T12:00:00Z";
const official = "https://www.makrobeasts.com";
const championships = [
  { id: "f3-fixture", name: "Formula 3 Fixture", status: "active" },
  { id: "porsche-fixture", name: "Porsche Fixture", status: "active" },
  { id: "future-fixture", name: "Future Fixture", status: "upcoming" },
].map((entry) => ({
  ...entry,
  url: `${official}/championships/${entry.id}`,
  image: `https://assets.example.test/championships/${entry.id}.svg`,
  car: entry.id === "porsche-fixture" ? "Porsche 992 Cup" : "Tatuus Formula 3",
  registered: 22,
  capacity: 30,
  license: "Rookie",
  format: "Two races · 30 minutes",
  rounds: 6,
  dateLabel: "28 OCT 2026",
}));
const configuredUrl = `${official}/championships/manifest-fixture`;
const status: Snapshot = {
  version: "1.6.0",
  assettoPath: "C:\\Fixture\\assettocorsa",
  cspVersion: "0.2.11",
  testMode: false,
  catalog: {
    manifest: {
      championship: "Manifest Fixture",
      season: "2026",
      build: "1.0.0",
      demo: false,
      content: [],
    },
    championship: {
      minimumHelperVersion: "1.0.0",
      resultsUrl: configuredUrl,
      requiredContent: [],
      events: [],
    },
    fetchedAt: checkedAt,
  },
  catalogError: null,
  content: [],
  jobs: [],
  raceReady: { ready: true, readyCount: 0, total: 0 },
};

function fixtureResults(id: string): ChampionshipResults {
  const label =
    id === "f3-fixture"
      ? "Formula"
      : id === "porsche-fixture"
        ? "Porsche"
        : "Manifest";
  const sourceUrl =
    championships.find((entry) => entry.id === id)?.url ?? configuredUrl;
  if (id === "future-fixture") {
    return { sourceUrl, updatedAt: checkedAt, standings: [], races: [] };
  }
  return {
    sourceUrl,
    updatedAt: checkedAt,
    standings: [
      {
        position: 1,
        number: "16",
        driver: `${label} Leader`,
        points: "100",
        teamNames: [`${label} Racing`],
      },
      {
        position: 2,
        number: "27",
        driver: `${label} Second`,
        points: "80",
        teamNames: [],
      },
    ],
    races: [
      {
        // Repeated ids across championships must not share an expanded result.
        id: "shared-round",
        round: "R1",
        name: `${label} Barcelona Round`,
        venue: "Barcelona GP",
        url: `${sourceUrl}/round-1`,
        sessions: ["Race 1", "Race 2"].map((name) => ({
          name,
          results: Array.from({ length: 22 }, (_, index) => ({
            position: index + 1,
            number: String(index + 1),
            driver: `${label} ${name} Driver ${String(index + 1).padStart(2, "0")}`,
            car: "Fixture car",
            time:
              index === 0
                ? "32:10.000"
                : `32:${String(10 + index).padStart(2, "0")}.600`,
          })),
        })),
      },
    ],
  };
}

function previewResults(id: string) {
  const full = fixtureResults(id);
  return {
    ...full,
    races: full.races.map((race) => ({
      ...race,
      resultsScope: "podium",
      sessions: race.sessions.map((session) => ({
        ...session,
        results: session.results.slice(0, 3),
      })),
    })),
  };
}

function fixtureDetails(id: string) {
  const championship = championships.find((entry) => entry.id === id)!;
  const label = id === "porsche-fixture" ? "Porsche" : "Formula";
  return {
    championshipId: id,
    sourceUrl: championship.url,
    updatedAt: checkedAt,
    description: `${label} season information published by MKBT.`,
    participants: Array.from({ length: 22 }, (_, index) => ({
      number: String(index + 1),
      driver: `${label} Entrant ${String(index + 1).padStart(2, "0")}`,
      team: index === 0 ? `${label} Racing` : null,
      car: championship.car,
    })),
    calendar: [
      {
        id: `${id}-round-1`,
        name: `${label} Barcelona`,
        track: "Barcelona GP",
        dateLabel: "14 OCT 2026",
        startAt: "2026-10-14T18:00:00Z",
        status: "completed",
      },
      {
        id: `${id}-round-2`,
        name: `${label} Spa`,
        track: "Spa-Francorchamps",
        dateLabel: "28 OCT 2026",
        startAt: "2026-10-28T18:00:00Z",
        status: "upcoming",
      },
    ],
    warnings: [],
  };
}

type MockOptions = {
  catalog?: (route: Route, refresh: boolean) => Promise<void>;
  details?: (route: Route, id: string, refresh: boolean) => Promise<void>;
  results?: (route: Route, id: string, refresh: boolean) => Promise<void>;
  brokenImages?: boolean;
};

async function mockChampionships(
  page: Page,
  brand: BrandId,
  options: MockOptions = {},
) {
  const calls: { path: string; id?: string; refresh: boolean }[] = [];
  const expectedPort = brand === "mkbt" ? "32145" : "32148";
  await page.clock.setFixedTime(new Date(checkedAt));
  await page.route("https://assets.example.test/championships/**", (route) =>
    options.brokenImages
      ? route.fulfill({ status: 404, body: "Missing fixture artwork" })
      : route.fulfill({
          contentType: "image/svg+xml",
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="500"><path fill="#263839" d="M0 0h1200v500H0z"/></svg>',
        }),
  );
  await page.route(
    /^http:\/\/127\.0\.0\.1:(32145|32148)\/api\//,
    async (route) => {
      const url = new URL(route.request().url());
      expect(url.port).toBe(expectedPort);
      const refresh = url.searchParams.get("refresh") === "true";
      if (url.pathname === "/api/session") {
        await route.fulfill({
          json: {
            token: `${brand}-championships-fixture`,
            brand,
            version: "1.6.0",
          },
        });
      } else if (url.pathname === "/api/status") {
        await route.fulfill({ json: { ...status, brand } });
      } else if (url.pathname === "/api/portal") {
        await route.fulfill({
          json: {
            servers: [],
            sponsors: [],
            teams: [],
            errors: [],
            fetchedAt: checkedAt,
          },
        });
      } else if (url.pathname === "/api/helper-update") {
        await route.fulfill({
          json: {
            currentVersion: "1.6.0",
            version: "1.6.0",
            available: false,
            url: null,
            downloadUrl: null,
            notes: null,
            publishedAt: null,
            published: false,
            automaticInstall: false,
            checkedAt,
          },
        });
      } else if (url.pathname === "/api/championships") {
        calls.push({ path: url.pathname, refresh });
        if (options.catalog) await options.catalog(route, refresh);
        else
          await route.fulfill({
            json: {
              sourceUrl: `${official}/championships`,
              updatedAt: checkedAt,
              championships,
              warnings: [],
            },
          });
      } else if (/^\/api\/championships\/[^/]+\/details$/.test(url.pathname)) {
        const id = decodeURIComponent(url.pathname.split("/")[3]);
        expect(championships.some((entry) => entry.id === id)).toBe(true);
        calls.push({ path: url.pathname, id, refresh });
        if (options.details) await options.details(route, id, refresh);
        else await route.fulfill({ json: fixtureDetails(id) });
      } else if (
        /^\/api\/championships\/[^/]+\/results\/[^/]+$/.test(url.pathname)
      ) {
        const parts = url.pathname.split("/");
        const id = decodeURIComponent(parts[3]);
        const roundId = decodeURIComponent(parts[5]);
        expect(roundId).toBe("shared-round");
        calls.push({ path: url.pathname, id, refresh });
        await route.fulfill({
          json: { ...fixtureResults(id).races[0], resultsScope: "full" },
        });
      } else if (/^\/api\/championships\/[^/]+\/results$/.test(url.pathname)) {
        const id = decodeURIComponent(url.pathname.split("/")[3]);
        expect(championships.some((entry) => entry.id === id)).toBe(true);
        calls.push({ path: url.pathname, id, refresh });
        if (options.results) await options.results(route, id, refresh);
        else await route.fulfill({ json: previewResults(id) });
      } else if (url.pathname === "/api/results") {
        calls.push({ path: url.pathname, refresh });
        await route.fulfill({ json: fixtureResults("manifest-fixture") });
      } else {
        await route.fulfill({
          status: 404,
          json: { message: `Unmocked championship fixture: ${url.pathname}` },
        });
      }
    },
  );
  return calls;
}

const card = (page: Page, name: string) =>
  page.getByRole("button", { name: `Open ${name}`, exact: true });
const dialog = (page: Page, name: string) =>
  page.getByRole("dialog", { name, exact: true });
async function openChampionship(page: Page, name: string, tab = "Overview") {
  await card(page, name).click();
  const details = dialog(page, name);
  await expect(details).toBeVisible();
  await expect(
    details.getByRole("tab", { name: "Overview", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  if (tab !== "Overview")
    await details.getByRole("tab", { name: tab, exact: true }).click();
  return details;
}
async function closeChampionship(page: Page) {
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
async function expectPageFits(page: Page) {
  const layout = await page.evaluate(() => ({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    overflow: Array.from(document.querySelectorAll("body *"))
      .filter((element) => {
        const box = element.getBoundingClientRect();
        return box.right > innerWidth + 1 && box.width > 0;
      })
      .slice(0, 12)
      .map((element) => ({
        tag: element.tagName,
        class: element.className,
        width: element.getBoundingClientRect().width,
        right: element.getBoundingClientRect().right,
      })),
  }));
  expect(layout.scrollWidth, JSON.stringify(layout)).toBeLessThanOrEqual(
    layout.width,
  );
}
const navigation = (page: Page, name: string) =>
  page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name, exact: true });

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("MKBT opens championship information from cards and keeps the saved selection without auto-opening", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mkbt");
  const calls = await mockChampionships(page, "mkbt");
  await page.goto("/#championship");
  await expect(card(page, "Formula 3 Fixture")).toBeVisible();
  await expect(card(page, "Porsche Fixture")).toBeVisible();
  await expect(card(page, "Future Fixture")).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Championship", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await openChampionship(page, "Formula 3 Fixture", "Standings");
  await expect(page.locator(".championship-standings-table")).toContainText(
    "Formula Leader",
  );
  await closeChampionship(page);
  await openChampionship(page, "Porsche Fixture", "Standings");
  await expect(page.locator(".championship-standings-table")).toContainText(
    "Porsche Leader",
  );
  await expect(page.getByText("Formula Leader", { exact: true })).toHaveCount(
    0,
  );
  await closeChampionship(page);
  await navigation(page, "Results").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await openChampionship(page, "Porsche Fixture", "Results");
  await expect(
    page.getByRole("heading", { name: "Porsche Barcelona Round", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Formula Barcelona Round", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(card(page, "Porsche Fixture")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("mkbt:active-championship:v1") ?? "null"),
    ),
  ).toBe("porsche-fixture");
  await openChampionship(page, "Porsche Fixture", "Results");
  await expect(
    page.getByRole("heading", { name: "Porsche Barcelona Round", exact: true }),
  ).toBeVisible();
  await closeChampionship(page);
  await navigation(page, "Standings").click();
  await openChampionship(page, "Porsche Fixture", "Standings");
  await expect(page.locator(".championship-standings-table")).toContainText(
    "Porsche Leader",
  );
  expect(calls.some((call) => call.id === "f3-fixture")).toBe(true);
  expect(calls.some((call) => call.id === "porsche-fixture")).toBe(true);
});

test("championship cards open official information, calendar and searchable participants with keyboard focus", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mkbt");
  const calls = await mockChampionships(page, "mkbt");
  await page.goto("/#results");
  const opener = card(page, "Porsche Fixture");
  await opener.focus();
  await page.keyboard.press("Enter");
  const information = dialog(page, "Porsche Fixture");
  await expect(information).toBeVisible();
  const overview = information.getByRole("tab", {
    name: "Overview",
    exact: true,
  });
  await expect(overview).toHaveAttribute("aria-selected", "true");
  await expect(
    information.getByText("Porsche season information published by MKBT.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(information).toContainText("Porsche 992 Cup");
  await expect(information).toContainText("Rookie");
  await expect(
    information.getByRole("heading", {
      name: "Championship schedule",
      exact: true,
    }),
  ).toBeVisible();
  await expect(information).toContainText("Spa-Francorchamps");
  await information
    .getByRole("searchbox", {
      name: "Search championship participants",
      exact: true,
    })
    .fill("Entrant 22");
  const entrants = information.getByRole("table", {
    name: "Registered championship participants",
    exact: true,
  });
  await expect(entrants.getByRole("row")).toHaveCount(2);
  await expect(entrants).toContainText("Porsche Entrant 22");
  await expect(entrants).not.toContainText("Porsche Entrant 01");
  await overview.focus();
  await page.keyboard.press("ArrowRight");
  const standings = information.getByRole("tab", {
    name: "Standings",
    exact: true,
  });
  await expect(standings).toBeFocused();
  await expect(standings).toHaveAttribute("aria-selected", "true");
  await expect(
    information.getByRole("table", { name: "Driver standings", exact: true }),
  ).toContainText("Porsche Leader");
  await page.keyboard.press("End");
  await expect(
    information.getByRole("tab", { name: "Results", exact: true }),
  ).toBeFocused();
  await expect(
    information.getByRole("heading", {
      name: "Porsche Barcelona Round",
      exact: true,
    }),
  ).toBeVisible();
  await closeChampionship(page);
  await expect(opener).toBeFocused();
  expect(
    calls.some(
      (call) => call.path === "/api/championships/porsche-fixture/details",
    ),
  ).toBe(true);
});

test("a slow previous championship cannot replace the current championship or its cache", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mkbt");
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  let firstRequested = false;
  await mockChampionships(page, "mkbt", {
    results: async (route, id) => {
      if (id === "f3-fixture") {
        firstRequested = true;
        await firstGate;
      }
      await route.fulfill({ json: fixtureResults(id) }).catch(() => {});
    },
  });
  try {
    await page.goto("/#championship");
    await openChampionship(page, "Formula 3 Fixture", "Standings");
    await expect.poll(() => firstRequested).toBe(true);
    await expect(page.locator(".championship-standings-table")).toHaveCount(0);
    await closeChampionship(page);
    await openChampionship(page, "Porsche Fixture", "Standings");
    await expect(page.locator(".championship-standings-table")).toContainText(
      "Porsche Leader",
    );
    releaseFirst();
    // The second route transition also gives a late response a render opportunity.
    await page.getByRole("tab", { name: "Results", exact: true }).click();
    await expect(
      page.getByRole("heading", {
        name: "Porsche Barcelona Round",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByText("Formula Leader", { exact: true })).toHaveCount(
      0,
    );
    await page.reload();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await openChampionship(page, "Porsche Fixture", "Results");
    await expect(
      page.getByRole("heading", {
        name: "Porsche Barcelona Round",
        exact: true,
      }),
    ).toBeVisible();
  } finally {
    releaseFirst();
  }
});

test("refresh uses the selected championship and retains its cached rows on failure", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mkbt");
  const calls = await mockChampionships(page, "mkbt", {
    results: async (route, id, refresh) => {
      if (refresh)
        await route.fulfill({
          status: 503,
          json: { message: "Fixture refresh unavailable" },
        });
      else await route.fulfill({ json: fixtureResults(id) });
    },
  });
  await page.goto("/#championship");
  await openChampionship(page, "Porsche Fixture", "Standings");
  await expect(page.locator(".championship-standings-table")).toContainText(
    "Porsche Leader",
  );
  await page
    .getByRole("button", { name: "Refresh standings", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Fixture refresh unavailable",
  );
  await expect(page.locator(".championship-standings-table")).toContainText(
    "Porsche Leader",
  );
  await page.getByRole("tab", { name: "Results", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Porsche Barcelona Round", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Refresh results", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Fixture refresh unavailable",
  );
  expect(
    calls.filter((call) => call.refresh && call.id).map((call) => call.id),
  ).toEqual(["porsche-fixture", "porsche-fixture"]);
  expect(calls.some((call) => call.path === "/api/results")).toBe(false);
});

test("cached results are isolated by championship and launcher while revalidating", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mkbt");
  let releaseResults!: () => void;
  const resultsGate = new Promise<void>((resolve) => {
    releaseResults = resolve;
  });
  await mockChampionships(page, "mkbt", {
    results: async (route, id) => {
      await resultsGate;
      await route.fulfill({ json: previewResults(id) }).catch(() => {});
    },
  });
  await page.addInitScript(
    ({ formula, porsche, manifest }) => {
      localStorage.setItem(
        "mkbt:active-championship:v1",
        JSON.stringify("porsche-fixture"),
      );
      localStorage.setItem(
        "mkbt:championship-results:f3-fixture:v1",
        JSON.stringify({ value: formula, at: Date.now() - 600000 }),
      );
      localStorage.setItem(
        "mkbt:championship-results:porsche-fixture:v1",
        JSON.stringify({ value: porsche, at: Date.now() - 600000 }),
      );
      localStorage.setItem(
        "mkbt:championship-results:v1",
        JSON.stringify(manifest),
      );
      localStorage.setItem(
        "epic:championship-results:porsche-fixture:v1",
        JSON.stringify({ value: manifest, at: Date.now() - 600000 }),
      );
    },
    {
      formula: previewResults("f3-fixture"),
      porsche: previewResults("porsche-fixture"),
      manifest: fixtureResults("manifest-fixture"),
    },
  );
  try {
    await page.goto("/#championship");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await openChampionship(page, "Porsche Fixture", "Standings");
    await expect(page.locator(".championship-standings-table")).toContainText(
      "Porsche Leader",
    );
    await expect(
      page.getByText("Manifest Leader", { exact: true }),
    ).toHaveCount(0);
    await closeChampionship(page);
    await openChampionship(page, "Formula 3 Fixture", "Standings");
    await expect(page.locator(".championship-standings-table")).toContainText(
      "Formula Leader",
    );
    await expect(page.getByText("Porsche Leader", { exact: true })).toHaveCount(
      0,
    );
    await closeChampionship(page);
    await openChampionship(page, "Porsche Fixture", "Standings");
    await expect(page.locator(".championship-standings-table")).toContainText(
      "Porsche Leader",
    );
    await page.getByRole("tab", { name: "Results", exact: true }).click();
    await expect(
      page.getByRole("heading", {
        name: "Porsche Barcelona Round",
        exact: true,
      }),
    ).toBeVisible();
  } finally {
    releaseResults();
  }
});

test("each championship keeps its own podium, gap and Top 20 expansion", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mkbt");
  await mockChampionships(page, "mkbt");
  await page.goto("/#results");
  await openChampionship(page, "Formula 3 Fixture", "Results");
  const formulaRace = page.getByRole("region", { name: "Race 1", exact: true });
  await expect(
    formulaRace.getByText("Formula Race 1 Driver 01", { exact: true }),
  ).toBeVisible();
  await expect(
    formulaRace.getByText("Formula Race 1 Driver 03", { exact: true }),
  ).toBeVisible();
  await expect(
    formulaRace.getByText("Formula Race 1 Driver 04", { exact: true }),
  ).toHaveCount(0);
  const formulaPodium = formulaRace.getByRole("table", {
    name: "Race 1 top 3",
    exact: true,
  });
  await expect(
    formulaPodium.getByRole("row").nth(1).getByRole("cell").last(),
  ).toHaveText("32:10.000");
  await expect(
    formulaPodium.getByRole("row").nth(2).getByRole("cell").last(),
  ).toHaveText("+1.600");
  await formulaRace.getByRole("button", { name: /Top 20/ }).click();
  await expect(
    formulaRace.getByText("Formula Race 1 Driver 20", { exact: true }),
  ).toBeVisible();
  await expect(
    formulaRace.getByText("Formula Race 1 Driver 21", { exact: true }),
  ).toHaveCount(0);
  const formulaSecondRace = page.getByRole("region", {
    name: "Race 2",
    exact: true,
  });
  await expect(
    formulaSecondRace.getByRole("button", { name: /Top 20/ }),
  ).toHaveAttribute("aria-expanded", "false");
  await closeChampionship(page);
  await openChampionship(page, "Porsche Fixture", "Results");
  const porscheRace = page.getByRole("region", { name: "Race 1", exact: true });
  await expect(
    porscheRace.getByText("Porsche Race 1 Driver 01", { exact: true }),
  ).toBeVisible();
  await expect(
    porscheRace.getByRole("button", { name: /Top 20/ }),
  ).toHaveAttribute("aria-expanded", "false");
  await expect(
    porscheRace.getByText("Porsche Race 1 Driver 20", { exact: true }),
  ).toHaveCount(0);
  await porscheRace.getByRole("button", { name: /Top 20/ }).click();
  await expect(
    porscheRace.getByText("Porsche Race 1 Driver 20", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Formula Race 1 Driver 20", { exact: true }),
  ).toHaveCount(0);
});

test("an unpublished championship shows honest empty standings and results", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mkbt");
  await mockChampionships(page, "mkbt");
  await page.goto("/#championship");
  await openChampionship(page, "Future Fixture", "Standings");
  await expect(
    page.getByRole("heading", { name: "No standings published", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".championship-standings-table")).toHaveCount(0);
  await page.getByRole("tab", { name: "Results", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "No race results published",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".race-result-card")).toHaveCount(0);
});

test("an unavailable championship catalog can be retried without borrowing configured results", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mkbt");
  const calls = await mockChampionships(page, "mkbt", {
    catalog: async (route, refresh) => {
      if (!refresh)
        await route.fulfill({
          status: 503,
          json: { message: "Fixture championship list unavailable" },
        });
      else
        await route.fulfill({
          json: {
            sourceUrl: `${official}/championships`,
            updatedAt: checkedAt,
            championships,
            warnings: [],
          },
        });
    },
  });
  await page.goto("/#championship");
  await expect(page.getByRole("alert")).toContainText(
    "Fixture championship list unavailable",
  );
  await expect(page.getByText("Manifest Leader", { exact: true })).toHaveCount(
    0,
  );
  await page
    .getByRole("button", { name: "Refresh championships", exact: true })
    .click();
  await expect(card(page, "Formula 3 Fixture")).toBeEnabled();
  await openChampionship(page, "Formula 3 Fixture", "Standings");
  await expect(page.locator(".championship-standings-table")).toContainText(
    "Formula Leader",
  );
  expect(
    calls.some((call) => call.path === "/api/championships" && call.refresh),
  ).toBe(true);
});

test("an empty active championship catalog has no borrowed standings and remains refreshable", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mkbt");
  const calls = await mockChampionships(page, "mkbt", {
    catalog: async (route) =>
      route.fulfill({
        json: {
          sourceUrl: `${official}/championships`,
          updatedAt: checkedAt,
          championships: [],
          warnings: [],
        },
      }),
  });
  await page.goto("/#championship");
  const refresh = page.getByRole("button", {
    name: "Refresh championships",
    exact: true,
  });
  await expect(refresh).toBeEnabled();
  await expect(page.locator(".championship-standings-table")).toHaveCount(0);
  await expect(page.getByText("Manifest Leader", { exact: true })).toHaveCount(
    0,
  );
  await refresh.click();
  await expect
    .poll(
      () => calls.filter((call) => call.path === "/api/championships").length,
    )
    .toBeGreaterThanOrEqual(2);
  await expect(refresh).toBeEnabled();
  expect(calls.some((call) => call.path === "/api/results")).toBe(false);
});

for (const width of [1440, 320]) {
  test(`championship details keep a stable dialog while information loads at ${width}px`, async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mkbt");
    let releaseDetails!: () => void;
    const detailsGate = new Promise<void>((resolve) => {
      releaseDetails = resolve;
    });
    await page.setViewportSize({ width, height: 1000 });
    await mockChampionships(page, "mkbt", {
      details: async (route, id) => {
        await detailsGate;
        await route.fulfill({ json: fixtureDetails(id) }).catch(() => {});
      },
    });
    try {
      await page.goto("/#championship");
      const information = await openChampionship(page, "Porsche Fixture");
      await page.evaluate(() => document.fonts.ready);
      const before = await information.boundingBox();
      expect(before).not.toBeNull();
      await expect(
        information.getByText("Porsche Entrant 01", { exact: true }),
      ).toHaveCount(0);
      releaseDetails();
      await expect(
        information.getByRole("table", {
          name: "Registered championship participants",
          exact: true,
        }),
      ).toContainText("Porsche Entrant 01");
      const after = await information.boundingBox();
      expect(after).not.toBeNull();
      for (const axis of ["x", "y", "width", "height"] as const)
        expect(
          Math.abs(after![axis] - before![axis]),
          `${axis} moved after details loaded`,
        ).toBeLessThanOrEqual(1);
      expect(
        await information.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `artifacts/brands/mkbt-championship-overview-${width}.png`,
        animations: "disabled",
      });
    } finally {
      releaseDetails();
    }
  });

  test(`missing championship covers preserve usable cards and modal at ${width}px`, async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mkbt");
    await page.setViewportSize({ width, height: 1000 });
    await mockChampionships(page, "mkbt", { brokenImages: true });
    await page.goto("/#championship");
    await expect(card(page, "Porsche Fixture")).toBeVisible();
    await expect(page.locator(".mkbt-championship-card img")).toHaveCount(0);
    const cards = page.locator(".mkbt-championship-card");
    await expect(cards).toHaveCount(championships.length);
    const first = await cards.nth(0).boundingBox();
    const second = await cards.nth(1).boundingBox();
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first!.height).toBeGreaterThan(180);
    if (width === 1440) {
      expect(Math.abs(first!.y - second!.y)).toBeLessThanOrEqual(1);
      expect(second!.x).toBeGreaterThan(first!.x + first!.width);
    } else {
      expect(second!.y).toBeGreaterThan(first!.y + first!.height);
      expect(Math.abs(first!.x - second!.x)).toBeLessThanOrEqual(1);
    }
    const information = await openChampionship(page, "Porsche Fixture");
    await expect(
      information.getByRole("table", {
        name: "Registered championship participants",
        exact: true,
      }),
    ).toBeVisible();
    await expect(information.locator("img")).toHaveCount(0);
    await expectPageFits(page);
    await closeChampionship(page);
    await expect(card(page, "Porsche Fixture")).toBeFocused();
  });

  test(`MKBT championship controls and results fit ${width}px`, async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mkbt");
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 1000 });
    await mockChampionships(page, "mkbt");
    await page.goto("/#championship");
    await expect(card(page, "Porsche Fixture")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expectPageFits(page);
    await page.screenshot({
      path: `artifacts/brands/mkbt-championship-cards-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    await openChampionship(page, "Porsche Fixture", "Standings");
    await expect(page.locator(".championship-standings-table")).toContainText(
      "Porsche Leader",
    );
    await page.evaluate(() => document.fonts.ready);
    await expectPageFits(page);
    await page.getByRole("tab", { name: "Results", exact: true }).click();
    await expect(
      page.getByRole("heading", {
        name: "Porsche Barcelona Round",
        exact: true,
      }),
    ).toBeVisible();
    const labelMetrics = await page
      .locator(".mkbt-race-table .team-driver > span:nth-child(2)")
      .first()
      .evaluate((element) => ({
        height: element.getBoundingClientRect().height,
        fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
      }));
    expect(
      labelMetrics.height,
      "Driver names should stay on one line inside each race table",
    ).toBeLessThanOrEqual(labelMetrics.fontSize * 1.7);
    await page
      .getByRole("button", { name: /Top 20/ })
      .first()
      .click();
    await expect(
      page.getByText("Porsche Race 1 Driver 20", { exact: true }),
    ).toBeVisible();
    await expectPageFits(page);
    await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
      window.scrollTo(0, 0);
    });
    await page.screenshot({
      path: `artifacts/brands/mkbt-championship-results-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    expect(errors).toEqual([]);
  });
}

test("Epic keeps the manifest championship and never requests the MKBT catalog", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "epic");
  const calls = await mockChampionships(page, "epic");
  await page.goto("/#championship");
  await expect(
    page.getByRole("button", { name: /^Open .* Fixture$/ }),
  ).toHaveCount(0);
  await expect(page.locator(".championship-standings-table")).toContainText(
    "Manifest Leader",
  );
  await navigation(page, "Results").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("heading", {
      name: "Manifest Barcelona Round",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Refresh results", exact: true })
    .click();
  await expect
    .poll(() =>
      calls.some((call) => call.path === "/api/results" && call.refresh),
    )
    .toBe(true);
  expect(calls.some((call) => call.path.startsWith("/api/championships"))).toBe(
    false,
  );
});
