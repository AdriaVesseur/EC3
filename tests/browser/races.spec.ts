import { expect, test, type Page, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { RaceCatalog, RaceEntry } from "../../src/races-types";

const api = "http://127.0.0.1:32155/api";
const checkedAt = "2026-10-20T10:00:00Z";
const official = "https://www.makrobeasts.com";

function entry(id: string, overrides: Partial<RaceEntry> = {}): RaceEntry {
  return {
    id,
    name: "Formula 3 · Barcelona",
    championship: "Formula 3 2026",
    kind: "championship",
    startAt: "2026-10-21T18:00:00Z",
    dateLabel: "21 OCT 2026",
    track: "Barcelona GP",
    car: "Tatuus F3 T-318 (2024)",
    image: null,
    url: `${official}/championships/${id}`,
    registrationUrl: `${official}/championships/${id}#registration`,
    status: "upcoming",
    registrationStatus: "open",
    registered: 18,
    capacity: 30,
    license: "Rookie",
    format: "Two races · 30 minutes",
    ...overrides,
  };
}

function catalog(overrides: Partial<RaceCatalog> = {}): RaceCatalog {
  return {
    sourceUrl: `${official}/championships/calendar`,
    updatedAt: checkedAt,
    timeZone: "Europe/Madrid",
    // Deliberately unsorted: the browser must put the next dated race first.
    races: [
      entry("gt3-spa", {
        name: "GT3 · Spa",
        championship: "GT3 Challenge",
        startAt: "2026-10-24T18:30:00Z",
        track: "Spa-Francorchamps",
        car: "GT3",
        registrationStatus: "full",
        registered: 30,
      }),
      entry("f3-barcelona"),
      entry("endurance", {
        name: "Endurance · Le Mans",
        championship: "MKBT Special Events",
        kind: "event",
        startAt: "2026-11-01T17:00:00Z",
        track: "Le Mans",
        car: "Hypercar / GT3",
        registrationStatus: "closed",
        format: "3 hours",
      }),
      entry("winter-announcement", {
        name: "Winter Special",
        championship: "MKBT Special Events",
        kind: "event",
        status: "pending",
        startAt: null,
        dateLabel: "NOVEMBER · Official date to follow",
        registrationUrl: null,
        registrationStatus: "unknown",
        registered: null,
        capacity: null,
        track: "",
        car: "",
        license: null,
        format: null,
      }),
      entry("f3-monza", {
        name: "Formula 3 · Monza",
        status: "completed",
        startAt: "2026-10-10T18:00:00Z",
        track: "Monza",
        registrationStatus: "closed",
      }),
    ],
    warnings: [],
    ...overrides,
  };
}

async function mockCatalog(
  page: Page,
  respond: (route: Route) => Promise<void> = (route) =>
    route.fulfill({ json: catalog() }),
) {
  await page.clock.setFixedTime(new Date(checkedAt));
  await page.route(`${api}/portal**`, (route) =>
    route.fulfill({
      json: {
        servers: [],
        sponsors: [],
        teams: [],
        errors: [],
        fetchedAt: checkedAt,
      },
    }),
  );
  await page.route(`${api}/helper-update**`, (route) =>
    route.fulfill({
      json: {
        currentVersion: "1.3.63",
        version: "1.3.63",
        available: false,
        url: null,
        downloadUrl: null,
        notes: null,
        publishedAt: null,
        published: false,
        checkedAt,
        automaticInstall: false,
      },
    }),
  );
  await page.route(`${api}/races**`, respond);
  await page.route(`${api}/races/*/details**`, (route) => {
    const id = decodeURIComponent(
      new URL(route.request().url()).pathname.split("/")[3],
    );
    return route.fulfill({
      json: {
        raceId: id,
        sourceUrl: `${official}/championships/${id}`,
        updatedAt: checkedAt,
        scope: "championship",
        participants: [],
        standings: [],
        results: [],
        warnings: [],
      },
    });
  });
}

const browser = (page: Page) =>
  page.getByRole("region", { name: "MKBT race browser" });
const rows = (page: Page) => browser(page).locator(".race-catalog-row");
const row = (page: Page, name: string) =>
  rows(page).filter({ has: page.getByRole("button", { name, exact: true }) });
const scheduleFilter = (page: Page, name: string) =>
  browser(page)
    .getByRole("group", { name: "Race schedule filter" })
    .getByRole("button", { name: new RegExp(`^${name}`) });
const display = (page: Page, name: "Cards" | "Schedule") =>
  browser(page)
    .getByRole("group", { name: "Race display" })
    .getByRole("button", { name, exact: true });

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "wait" });
});

test("Races opens from navigation and defaults to the next upcoming rounds", async ({
  page,
}) => {
  let requests = 0;
  await mockCatalog(page, (route) => {
    requests++;
    return route.fulfill({ json: catalog() });
  });
  await page.goto("/#content");
  await expect(page.locator(".online-status")).toHaveText("Online");
  expect(requests).toBe(0);
  await page.getByRole("link", { name: "Races", exact: true }).click();
  await expect(page).toHaveURL(/#races$/);
  await expect(rows(page)).toHaveCount(3);
  await expect(scheduleFilter(page, "Upcoming")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(display(page, "Cards")).toHaveAttribute("aria-pressed", "true");
  await expect(
    rows(page)
      .first()
      .getByRole("button", { name: "Formula 3 · Barcelona", exact: true }),
  ).toBeVisible();
  await expect(rows(page).last()).toContainText("Endurance · Le Mans");
  await expect(
    row(page, "Formula 3 · Barcelona").locator("time"),
  ).toHaveAttribute("datetime", "2026-10-21T18:00:00Z");
  await expect(
    row(page, "Formula 3 · Barcelona").locator("time"),
  ).toContainText("20:00");
  await expect(row(page, "Formula 3 · Barcelona")).toContainText("18 / 30");
  await expect(browser(page)).toContainText("Times in Europe/Madrid");
  await expect(row(page, "Formula 3 · Monza")).toHaveCount(0);
});

test("card and schedule views preserve the selected races and detail actions", async ({
  page,
}) => {
  await mockCatalog(page);
  await page.goto("/#races");
  await browser(page)
    .getByRole("searchbox", {
      name: "Search races, series, cars or circuits",
    })
    .fill("formula 3");
  await expect(rows(page)).toHaveCount(1);
  await display(page, "Schedule").click();
  await expect(display(page, "Schedule")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(display(page, "Cards")).toHaveAttribute("aria-pressed", "false");
  await expect(rows(page)).toHaveCount(1);
  const detailsTrigger = row(page, "Formula 3 · Barcelona").getByRole(
    "button",
    { name: "Race details" },
  );
  await detailsTrigger.click();
  const detail = page.getByRole("dialog", { name: "Formula 3 · Barcelona" });
  await expect(detail).toBeVisible();
  await expect(
    detail.getByRole("link", { name: "Sign up on MKBT" }),
  ).toHaveAttribute(
    "href",
    `${official}/championships/f3-barcelona#registration`,
  );
  await page.keyboard.press("Escape");
  await expect(detailsTrigger).toBeFocused();
  await display(page, "Cards").click();
  await expect(display(page, "Cards")).toHaveAttribute("aria-pressed", "true");
  await expect(rows(page)).toHaveCount(1);
});

test("competition, sorting and favourites combine and can be reset", async ({
  page,
}) => {
  await mockCatalog(page);
  await page.goto("/#races");
  await scheduleFilter(page, "All races").click();
  await browser(page)
    .getByRole("combobox", { name: "Competition", exact: true })
    .selectOption({ label: "Formula 3 2026" });
  await expect(rows(page)).toHaveCount(2);
  await browser(page)
    .getByRole("combobox", { name: "Sort races", exact: true })
    .selectOption("name");
  await expect(rows(page).first()).toContainText("Formula 3 · Barcelona");
  await expect(rows(page).last()).toContainText("Formula 3 · Monza");
  await browser(page)
    .getByRole("combobox", { name: "Competition", exact: true })
    .selectOption("all");
  await expect(rows(page).first()).toContainText("Endurance · Le Mans");
  await expect(rows(page).last()).toContainText("Winter Special");
  await browser(page)
    .getByRole("combobox", { name: "Competition", exact: true })
    .selectOption({ label: "GT3 Challenge" });
  await browser(page)
    .getByRole("checkbox", { name: "Favourites only" })
    .check();
  await expect(rows(page)).toHaveCount(0);
  const search = browser(page).getByRole("searchbox", {
    name: "Search races, series, cars or circuits",
  });
  await search.fill("no matching circuit");
  await browser(page)
    .getByRole("combobox", { name: "Race type" })
    .selectOption("event");
  await browser(page).getByRole("button", { name: "Show all races" }).click();
  await expect(search).toHaveValue("");
  await expect(
    browser(page).getByRole("checkbox", { name: "Favourites only" }),
  ).not.toBeChecked();
  await expect(
    browser(page).getByRole("combobox", { name: "Competition", exact: true }),
  ).toHaveValue("all");
  await expect(
    browser(page).getByRole("combobox", { name: "Race type" }),
  ).toHaveValue("all");
  await expect(rows(page)).toHaveCount(5);
});

test("a favourite applies to every round of a series and persists after reload", async ({
  page,
}) => {
  await mockCatalog(page);
  await page.goto("/#races");
  await scheduleFilter(page, "All races").click();
  const favourite = (name: string) =>
    row(page, name).getByRole("button", {
      name: "Favourite Formula 3 2026",
      exact: true,
    });
  await expect(favourite("Formula 3 · Barcelona")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await favourite("Formula 3 · Barcelona").click();
  await expect(favourite("Formula 3 · Barcelona")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(favourite("Formula 3 · Monza")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await browser(page)
    .getByRole("checkbox", { name: "Favourites only" })
    .check();
  await expect(rows(page)).toHaveCount(2);
  await expect(row(page, "GT3 · Spa")).toHaveCount(0);
  await page.reload();
  await scheduleFilter(page, "All races").click();
  await browser(page)
    .getByRole("checkbox", { name: "Favourites only" })
    .check();
  await expect(rows(page)).toHaveCount(2);
  await expect(favourite("Formula 3 · Barcelona")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(favourite("Formula 3 · Monza")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await favourite("Formula 3 · Monza").click();
  await expect(rows(page)).toHaveCount(0);
  await browser(page)
    .getByRole("checkbox", { name: "Favourites only" })
    .uncheck();
  await expect(rows(page)).toHaveCount(5);
  await expect(favourite("Formula 3 · Barcelona")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(favourite("Formula 3 · Monza")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

test("cards use series artwork and fall back to the circuit when it is unavailable", async ({
  page,
}) => {
  const seriesImage = `${official}/fixtures/series.svg`;
  const trackImage = `${official}/fixtures/circuit.svg`;
  let unavailable = false;
  const art =
    '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><path fill="#173c40" d="M0 0h640v360H0z"/><path fill="none" stroke="#65d8cf" stroke-width="14" d="M70 260 140 80h240l180 170-80 40H200Z"/></svg>';
  await page.route(`${official}/fixtures/**`, (route) =>
    route.request().url().endsWith("unavailable.svg")
      ? route.fulfill({ status: 404, body: "Artwork is unavailable" })
      : route.fulfill({ contentType: "image/svg+xml", body: art }),
  );
  await mockCatalog(page, (route) =>
    route.fulfill({
      json: catalog({
        races: [
          entry("f3-barcelona", {
            image: trackImage,
            seriesImage: unavailable
              ? `${official}/fixtures/unavailable.svg`
              : seriesImage,
          }),
        ],
      }),
    }),
  );
  await page.goto("/#races");
  const cover = row(page, "Formula 3 · Barcelona").locator(
    ".race-catalog-cover img",
  );
  await expect(cover).toHaveAttribute("src", seriesImage);
  await expect
    .poll(() => cover.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0);
  unavailable = true;
  await browser(page).getByRole("button", { name: "Refresh races" }).click();
  await expect(cover).toHaveAttribute("src", trackImage);
  await expect(cover).toBeVisible();
});

test("schedule, race type and search filters combine and reset without inventing dates", async ({
  page,
}) => {
  await mockCatalog(page);
  await page.goto("/#races");
  await scheduleFilter(page, "All races").click();
  await expect(rows(page)).toHaveCount(5);
  const pending = row(page, "Winter Special");
  await expect(pending).toContainText("NOVEMBER · Official date to follow");
  await expect(pending.locator("time")).toHaveCount(0);
  await expect(pending).toContainText("Pending confirmation");
  await browser(page)
    .getByRole("combobox", { name: "Race type" })
    .selectOption("event");
  await expect(rows(page)).toHaveCount(2);
  const search = browser(page).getByRole("searchbox", {
    name: "Search races, series, cars or circuits",
  });
  await search.fill("  le mans  ");
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText("Endurance · Le Mans");
  await search.fill("no matching circuit");
  await expect(
    browser(page).getByRole("heading", {
      name: "No races match these filters",
    }),
  ).toBeVisible();
  await browser(page).getByRole("button", { name: "Show all races" }).click();
  await expect(search).toHaveValue("");
  await expect(
    browser(page).getByRole("combobox", { name: "Race type" }),
  ).toHaveValue("all");
  await expect(rows(page)).toHaveCount(5);
  await scheduleFilter(page, "Completed").click();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText("Formula 3 · Monza");
  await expect(rows(page).getByRole("link")).toHaveCount(0);
});

test("race details retain keyboard focus and sign-up opens only the official page", async ({
  page,
  context,
}) => {
  await mockCatalog(page);
  let signupRequests = 0;
  await context.route(
    `${official}/championships/f3-barcelona**`,
    async (route) => {
      signupRequests++;
      await route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><html lang='en'><title>Official MKBT registration fixture</title><body><h1>Registration fixture</h1></body></html>",
      });
    },
  );
  await page.goto("/#races");
  const detailsTrigger = row(page, "Formula 3 · Barcelona").getByRole(
    "button",
    { name: "Race details" },
  );
  await detailsTrigger.click();
  const detail = page.getByRole("dialog", { name: "Formula 3 · Barcelona" });
  await expect(detail).toBeVisible();
  await expect(detail).toContainText("Wednesday, 21 October 2026 at 20:00");
  await expect(detail).toContainText("Barcelona GP");
  await expect(detail).toContainText("Tatuus F3 T-318 (2024)");
  await expect(detail).toContainText("Two races · 30 minutes");
  await expect(detail).toContainText("Rookie");
  await expect(detail).toContainText("18 / 30");
  await expect(
    detail.getByRole("button", { name: "Close details" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(detail).toHaveCount(0);
  await expect(detailsTrigger).toBeFocused();
  await detailsTrigger.click();
  const signup = detail.getByRole("link", { name: "Sign up on MKBT" });
  await expect(signup).toHaveAttribute(
    "href",
    `${official}/championships/f3-barcelona#registration`,
  );
  await expect(signup).toHaveAttribute("target", "_blank");
  await expect(signup).toHaveAttribute("rel", "noopener noreferrer");
  const popupPromise = page.waitForEvent("popup");
  await signup.click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(
    `${official}/championships/f3-barcelona#registration`,
  );
  await expect(
    popup.getByRole("heading", { name: "Registration fixture" }),
  ).toBeVisible();
  expect(signupRequests).toBe(1);
  await popup.close();
  await page.bringToFront();
  await page.keyboard.press("Escape");
  await expect(detail).toHaveCount(0);
  await expect(detailsTrigger).toBeFocused();
});

test("loaded races remain available when returning to the section during refresh", async ({
  page,
}) => {
  let requests = 0;
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  await mockCatalog(page, async (route) => {
    requests++;
    if (requests > 1) await pending;
    await route.fulfill({ json: catalog() });
  });
  await page.goto("/#races");
  await expect(rows(page)).toHaveCount(3);
  await page
    .getByRole("link", { name: "Content library", exact: true })
    .click();
  await expect(browser(page)).toHaveCount(0);
  const previousRequests = requests;
  await page.getByRole("link", { name: "Races", exact: true }).click();
  await expect(
    browser(page).getByRole("button", { name: "Refreshing…" }),
  ).toBeDisabled();
  await expect(rows(page)).toHaveCount(3);
  expect(requests).toBe(previousRequests + 1);
  finish();
  await expect(
    browser(page).getByRole("button", { name: "Refresh races" }),
  ).toBeEnabled();
});

test("a helper disconnect preserves the last loaded schedule for browsing", async ({
  page,
}) => {
  await mockCatalog(page);
  await page.goto("/#races");
  await expect(rows(page)).toHaveCount(3);
  // The real demo helper supplies the initial session and status. Only its later
  // status heartbeat is failed, representing the helper closing after loading.
  const heartbeat = page.waitForRequest(`${api}/status`);
  await page.route(`${api}/status`, (route) =>
    route.abort("connectionrefused"),
  );
  await heartbeat;
  await expect(page.locator(".online-status")).toHaveText("Offline", {
    timeout: 10000,
  });
  await expect(browser(page).getByRole("status")).toContainText(
    "Showing the last loaded schedule.",
    { timeout: 10000 },
  );
  await expect(rows(page)).toHaveCount(3);
  await expect(
    browser(page).getByRole("button", { name: "Refresh races" }),
  ).toBeDisabled();
  await row(page, "Formula 3 · Barcelona")
    .getByRole("button", { name: "Race details" })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Formula 3 · Barcelona" }),
  ).toBeVisible();
});

test("full, closed and pending entries display their official availability", async ({
  page,
}) => {
  await mockCatalog(page);
  await page.goto("/#races");
  const full = row(page, "GT3 · Spa");
  await expect(full).toContainText("30 / 30");
  await expect(full).toContainText("Full grid");
  await expect(
    full.getByRole("link", { name: "View entry options" }),
  ).toHaveAttribute("href", `${official}/championships/gt3-spa#registration`);
  await expect(row(page, "Endurance · Le Mans").getByRole("link")).toHaveCount(
    0,
  );
  await full.getByRole("button", { name: "Race details" }).click();
  const fullDetails = page.getByRole("dialog", { name: "GT3 · Spa" });
  await expect(fullDetails).toContainText(
    "Full grid · review availability on MKBT",
  );
  await fullDetails.getByRole("button", { name: "Close details" }).click();
  await scheduleFilter(page, "All races").click();
  await row(page, "Winter Special")
    .getByRole("button", { name: "Race details" })
    .click();
  const pendingDetails = page.getByRole("dialog", { name: "Winter Special" });
  await expect(pendingDetails).toContainText(
    "NOVEMBER · Official date to follow",
  );
  await expect(pendingDetails).toContainText("To be confirmed");
  await expect(
    pendingDetails.getByRole("link", {
      name: /Sign up|Registration|entry options/,
    }),
  ).toHaveCount(0);
});

test("registration rejects unofficial and unsafe destination URLs", async ({
  page,
}) => {
  await mockCatalog(page, (route) =>
    route.fulfill({
      json: catalog({
        sourceUrl: "https://makrobeasts.com.evil.test/calendar",
        races: [
          entry("unsafe", {
            name: "Unsafe link fixture",
            url: "javascript:alert(1)",
            registrationUrl: "https://makrobeasts.com.evil.test/register",
          }),
        ],
      }),
    }),
  );
  await page.goto("/#races");
  await expect(row(page, "Unsafe link fixture").getByRole("link")).toHaveCount(
    0,
  );
  await expect(
    browser(page).getByRole("link", { name: "Official MKBT calendar" }),
  ).toHaveAttribute("href", `${official}/championships/calendar`);
  await row(page, "Unsafe link fixture")
    .getByRole("button", { name: "Race details" })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Unsafe link fixture" }).getByRole("link"),
  ).toHaveCount(0);
});

test("a failed refresh retains loaded races and can be retried", async ({
  page,
}) => {
  let fail = false;
  const requests: string[] = [];
  await mockCatalog(page, (route) => {
    requests.push(route.request().url());
    return fail
      ? route.fulfill({
          status: 503,
          json: { message: "MKBT is temporarily unavailable." },
        })
      : route.fulfill({ json: catalog() });
  });
  await page.goto("/#races");
  await expect(rows(page)).toHaveCount(3);
  fail = true;
  await browser(page).getByRole("button", { name: "Refresh races" }).click();
  await expect(browser(page).getByRole("status")).toContainText(
    "MKBT is temporarily unavailable.",
  );
  await expect(browser(page).getByRole("status")).toContainText(
    "The last loaded races remain available below.",
  );
  await expect(rows(page)).toHaveCount(3);
  expect(requests.at(-1)).toContain("?refresh=true");
  fail = false;
  await browser(page).getByRole("button", { name: "Refresh races" }).click();
  await expect(browser(page).locator(".race-catalog-notice")).toHaveCount(0);
  await expect(rows(page)).toHaveCount(3);
});

test("initial loading, errors, retry and an empty published schedule are explicit", async ({
  page,
}) => {
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let initial = true;
  await mockCatalog(page, async (route) => {
    if (initial) {
      await pending;
      await route.fulfill({
        status: 503,
        json: { message: "Calendar service is offline." },
      });
    } else {
      await route.fulfill({ json: catalog({ races: [] }) });
    }
  });
  await page.goto("/#races");
  await expect(browser(page).getByRole("status", { name: "" })).toContainText(
    "Loading MKBT races…",
  );
  await expect(
    browser(page).getByRole("button", { name: "Refreshing…" }),
  ).toBeDisabled();
  finish();
  await expect(
    browser(page).getByRole("heading", {
      name: "Could not load the race calendar",
    }),
  ).toBeVisible();
  await expect(browser(page).getByRole("status")).toContainText(
    "Calendar service is offline.",
  );
  initial = false;
  await browser(page).getByRole("button", { name: "Refresh races" }).click();
  await expect(
    browser(page).getByRole("heading", { name: "No races published" }),
  ).toBeVisible();
  await expect(browser(page).locator(".race-catalog-notice")).toHaveCount(0);
  await expect(rows(page)).toHaveCount(0);
});

test("the long registration label and arrow fit the compact schedule action", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockCatalog(page, (route) =>
    route.fulfill({
      json: catalog({
        races: [entry("f3-barcelona", { registrationStatus: "unknown" })],
      }),
    }),
  );
  await page.goto("/#races");
  await display(page, "Schedule").click();
  const race = row(page, "Formula 3 · Barcelona");
  const registration = race.getByRole("link", {
    name: "Registration on MKBT",
    exact: true,
  });
  await expect(registration).toBeVisible();
  const bounds = await registration.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const arrow = element.querySelector("svg")!.getBoundingClientRect();
    const label = [...element.childNodes]
      .filter(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
      )
      .flatMap((node) => {
        const range = document.createRange();
        range.selectNodeContents(node);
        return [...range.getClientRects()].map((part) => ({
          left: part.left,
          right: part.right,
          top: part.top,
          bottom: part.bottom,
        }));
      });
    return {
      button: {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
      },
      arrow: {
        left: arrow.left,
        right: arrow.right,
        top: arrow.top,
        bottom: arrow.bottom,
      },
      label,
      fits: element.scrollWidth <= element.clientWidth,
    };
  });
  expect(bounds.label.length).toBeGreaterThan(0);
  expect(bounds.fits).toBe(true);
  for (const part of [...bounds.label, bounds.arrow]) {
    expect(part.left).toBeGreaterThanOrEqual(bounds.button.left - 1);
    expect(part.right).toBeLessThanOrEqual(bounds.button.right + 1);
    expect(part.top).toBeGreaterThanOrEqual(bounds.button.top - 1);
    expect(part.bottom).toBeLessThanOrEqual(bounds.button.bottom + 1);
  }
  expect(
    await race.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
});

for (const width of [320, 900, 1440]) {
  test(`both race views and details fit ${width}px and pass accessibility checks`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await mockCatalog(page);
    await page.goto("/#races");
    await expect(rows(page)).toHaveCount(3);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await browser(page).screenshot({
      path: `work/qa/races-${width}.png`,
      animations: "disabled",
    });
    await display(page, "Schedule").click();
    await expect(display(page, "Schedule")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(rows(page)).toHaveCount(3);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await browser(page).screenshot({
      path: `work/qa/races-schedule-${width}.png`,
      animations: "disabled",
    });
    await row(page, "Formula 3 · Barcelona")
      .getByRole("button", { name: "Race details" })
      .click();
    const detail = page.getByRole("dialog", { name: "Formula 3 · Barcelona" });
    await expect(detail).toBeVisible();
    const bounds = await detail.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.width).toBeLessThanOrEqual(width);
    expect(
      await detail.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: `work/qa/races-detail-${width}.png`,
      animations: "disabled",
    });
    await detail.getByRole("button", { name: "Close details" }).click();
  });
}
