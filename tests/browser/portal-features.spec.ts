import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { AppUpdateInfo } from "../../src/AppUpdateNotice";
import type {
  LiveTimingSnapshot,
  PortalResponse,
  ServerConfig,
  ServersResponse,
} from "../../src/portal-types";

const api = "http://127.0.0.1:32155/api";
const checkedAt = "2026-09-30T14:00:00Z";
const practice: ServerConfig = {
  id: "practice-a",
  name: "Championship practice",
  ip: "198.51.100.24",
  httpPort: 8081,
  image: "https://assets.example.test/practice.jpg",
  description: "Practice with the championship grid.",
  liveTimingUrl: "https://timing.example.test/practice",
  embedTiming: true,
};
const race: ServerConfig = {
  id: "race-b",
  name: "Championship race",
  host: "race.example.test",
  httpPort: 8082,
  liveTimingUrl: "https://timing.example.test/race",
  embedTiming: false,
};

function serverResponse(available = true): ServersResponse {
  return {
    servers: [practice, race].map((server, index) => ({
      server,
      state: "online" as const,
      info: {
        name: server.name,
        track: index ? "race_circuit" : "practice_circuit",
        currentPlayers: index ? 18 : 12,
        maxPlayers: 30,
        session: index ? 3 : 1,
        timeLeft: index ? 1200 : 905,
        cars: ["ec3_fixture_car", "ec3_alternate_car"],
        passwordRequired: !!index,
      },
      error: null,
      checkedAt,
      joinAvailable: available,
      availableCars: [
        { id: "ec3_fixture_car", name: "EC3 Fixture Car" },
        { id: "ec3_alternate_car", name: "EC3 Alternate Car" },
      ],
    })),
    contentManagerAvailable: available,
    errors: [],
    checkedAt,
  };
}

function portalResponse(): PortalResponse {
  return {
    servers: [practice, race],
    sponsors: [],
    teams: [],
    errors: [],
    fetchedAt: checkedAt,
  };
}

function noAppRelease(): AppUpdateInfo {
  return {
    currentVersion: "1.3.0",
    version: "1.3.0",
    available: false,
    url: null,
    downloadUrl: null,
    notes: null,
    publishedAt: null,
    published: false,
    checkedAt,
    automaticInstall: false,
  };
}

function publishedUpdate(version: string): AppUpdateInfo {
  return {
    currentVersion: "1.3.0",
    version,
    available: true,
    url: `https://github.com/AdriaVesseur/EC3/releases/tag/v${version}`,
    downloadUrl: `https://github.com/AdriaVesseur/EC3/releases/download/v${version}/Eurocup3-Helper-Setup.exe`,
    notes: "Improved server browsing.\nUpdated championship content cards.",
    publishedAt: "2026-09-30T13:00:00Z",
    published: true,
    checkedAt,
    automaticInstall: false,
  };
}

async function mockFeatures(
  page: Page,
  options: {
    servers?: () => ServersResponse;
    portal?: () => PortalResponse;
    update?: () => AppUpdateInfo;
    serverFailure?: () => boolean;
    updateFailure?: () => boolean;
    onServers?: () => void;
    onJoin?: (id: string, method: string, body: unknown) => void;
  } = {},
) {
  await page.route(`${api}/portal**`, (route) =>
    route.fulfill({ json: options.portal?.() ?? portalResponse() }),
  );
  await page.route(
    /^http:\/\/127\.0\.0\.1:32155\/api\/servers(?:\?.*)?$/,
    (route) => {
      options.onServers?.();
      return options.serverFailure?.()
        ? route.fulfill({
            status: 503,
            json: { message: "Server status could not be refreshed." },
          })
        : route.fulfill({ json: options.servers?.() ?? serverResponse() });
    },
  );
  await page.route(`${api}/servers/*/join`, (route) => {
    const request = route.request();
    const id = new URL(request.url()).pathname.split("/").at(-2)!;
    options.onJoin?.(id, request.method(), request.postDataJSON());
    return route.fulfill({
      json: {
        serverId: id,
        launched: true,
        message: "Content Manager has been opened for this server.",
      },
    });
  });
  await page.route(`${api}/servers/*/timing`, (route) =>
    route.fulfill({
      json: {
        serverId: "practice-a",
        session: "Practice",
        track: "kyalami",
        driverCount: 1,
        offlineDriverCount: 1,
        updatedAt: checkedAt,
        drivers: [
          {
            position: 1,
            number: "19",
            name: "Carlos Leiva",
            carId: "porsche_cup",
            car: "Porsche 911 GT3 CUP",
            team: "EC3 Racing",
            skin: "19_carlos",
            tyres: "S",
            laps: 47,
            bestLapSeconds: 107.488,
            lastLapSeconds: 108.321,
            inPits: false,
            ping: 46,
            split: "00:13.450",
            lastSeen: checkedAt,
          },
        ],
        offlineDrivers: [
          {
            position: 1,
            number: "16",
            name: "Samuel Fernández",
            carId: "porsche_cup",
            car: "Porsche CUP",
            team: "Team 16",
            skin: "16_blue",
            tyres: "M",
            laps: 35,
            bestLapSeconds: 108.123,
            lastLapSeconds: 109.456,
            inPits: true,
            ping: 38,
            split: "01:12.200",
            lastSeen: checkedAt,
          },
        ],
      } satisfies LiveTimingSnapshot,
    }),
  );
  await page.route(`${api}/helper-update**`, (route) =>
    options.updateFailure?.()
      ? route.fulfill({
          status: 503,
          json: { message: "The app update service is unavailable." },
        })
      : route.fulfill({ json: options.update?.() ?? noAppRelease() }),
  );
  await page.route("https://timing.example.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><html lang='en'><title>Timing fixture</title><body><main aria-label='External timing fixture'><h1>Configured live timing fixture</h1></main></body></html>",
    }),
  );
}

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "wait" });
});

test("a sponsor configuration error is visible in Settings and can be refreshed", async ({
  page,
}) => {
  let invalid = true;
  await mockFeatures(page, {
    portal: () => ({
      ...portalResponse(),
      errors: invalid
        ? [
            {
              source: "sponsors",
              code: "INVALID_SPONSORS",
              message: "Sponsor website is missing in sponsors.json.",
            },
          ]
        : [],
    }),
  });
  await page.goto("/#settings");
  await expect(
    page.getByText("Sponsor website is missing in sponsors.json."),
  ).toBeVisible();
  invalid = false;
  await page
    .getByRole("button", { name: "Refresh services", exact: true })
    .click();
  await expect(
    page.getByText("Sponsor website is missing in sponsors.json."),
  ).toHaveCount(0);
});

test("Servers loads only when opened, shows reported details and joins the selected server", async ({
  page,
}) => {
  let statusRequests = 0;
  const joins: { id: string; method: string; body: unknown }[] = [];
  await page.addInitScript(() => {
    let failCopy = true;
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async (text: string) => {
          if (failCopy) {
            failCopy = false;
            throw new DOMException(
              "Clipboard fixture denied",
              "NotAllowedError",
            );
          }
          (window as Window & { copiedServerIP?: string }).copiedServerIP =
            text;
        },
      },
    });
  });
  await mockFeatures(page, {
    onServers: () => statusRequests++,
    onJoin: (id, method, body) => joins.push({ id, method, body }),
  });
  await page.route("https://assets.example.test/practice.jpg", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#252932"/></svg>',
    }),
  );
  await page.goto("/");
  await expect(page.getByText("Online", { exact: true })).toBeVisible();
  expect(statusRequests).toBe(0);
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Servers", exact: true })
    .click();
  const serverColumns = await page
    .locator(".servers-grid")
    .evaluate(
      (element) =>
        getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/)
          .length,
    );
  expect(serverColumns).toBe(1);
  const card = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: practice.name }) });
  await expect(card).toBeVisible();
  await expect(card.locator(".server-card-cover img")).toHaveAttribute(
    "src",
    practice.image!,
  );
  await expect(
    card.getByText("View server details", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog", { name: practice.name })).toHaveCount(
    0,
  );
  await card
    .getByRole("button", { name: `View details for ${practice.name}` })
    .click();
  const practiceDetails = page.getByRole("dialog", { name: practice.name });
  await expect(practiceDetails).toBeVisible();
  const trackCard = practiceDetails.locator(".server-detail-option");
  const carCard = practiceDetails.locator(".server-detail-car-section");
  const [trackBounds, carBounds] = await Promise.all([
    trackCard.boundingBox(),
    carCard.boundingBox(),
  ]);
  expect(trackBounds?.width).toBeCloseTo(carBounds?.width ?? 0, 0);
  expect(trackBounds?.height).toBeCloseTo(carBounds?.height ?? 0, 0);
  const trackRadius = await trackCard.evaluate(
    (element) => getComputedStyle(element).borderRadius,
  );
  const carRadius = await carCard.evaluate(
    (element) => getComputedStyle(element).borderRadius,
  );
  const trackImageRadius = await trackCard
    .locator(".server-detail-option-artwork")
    .evaluate((element) => getComputedStyle(element).borderRadius);
  const carImageRadius = await carCard
    .locator(".server-car-picker-summary")
    .evaluate((element) => getComputedStyle(element).borderRadius);
  expect(trackRadius).toBe(carRadius);
  expect(trackImageRadius).toBe(carImageRadius);
  await expect(trackCard.locator(".server-detail-option-copy")).toHaveCSS(
    "bottom",
    "14px",
  );
  await expect(
    practiceDetails.getByText("practice circuit", { exact: true }),
  ).toBeVisible();
  await expect(
    practiceDetails.getByText("Track for this server", { exact: true }),
  ).toHaveCount(0);
  const carPicker = practiceDetails.locator(".server-car-picker");
  await expect(carPicker.locator("summary")).toContainText("Choose your car");
  await expect(carPicker.locator("details")).toHaveCount(0);
  await carPicker.locator("summary").click();
  await expect(carPicker.locator(".server-car-picker-menu")).toBeVisible();
  await practiceDetails
    .getByRole("button", { name: /EC3 Alternate Car/ })
    .click();
  await expect(carPicker.locator("summary")).toContainText("EC3 Alternate Car");
  await expect(carPicker.locator(".server-car-picker-menu")).toBeHidden();
  await expect(practiceDetails.locator(".server-details > div")).toHaveCount(3);
  await expect(practiceDetails.locator(".server-details dt").first()).toHaveCSS(
    "justify-content",
    "center",
  );
  await expect(practiceDetails.locator(".server-details dd").first()).toHaveCSS(
    "text-align",
    "center",
  );
  await expect(
    practiceDetails.getByText("Server IP", { exact: true }),
  ).toBeVisible();
  await expect(
    practiceDetails.getByText(practice.ip!, { exact: true }),
  ).toBeVisible();
  await practiceDetails
    .getByRole("button", { name: `Copy server address ${practice.ip}` })
    .click();
  const copyFailure = page.getByText(
    "Copy is unavailable. Select the server address and copy it manually.",
  );
  await expect(copyFailure).toBeVisible();
  await practiceDetails
    .getByRole("button", { name: `Copy server address ${practice.ip}` })
    .click();
  await expect(copyFailure).toHaveCount(0);
  await expect(
    practiceDetails.getByText("Copied", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as Window & { copiedServerIP?: string }).copiedServerIP,
    ),
  ).toBe(practice.ip);
  expect(statusRequests).toBeGreaterThan(0);
  await expect(
    practiceDetails.getByText("12 / 30", { exact: true }),
  ).toBeVisible();
  await expect(
    practiceDetails
      .locator(".server-details dd")
      .filter({ hasText: "Practice" }),
  ).toBeVisible();
  await expect(
    practiceDetails.getByText("15:05", { exact: true }),
  ).toBeVisible();
  await practiceDetails.getByRole("button", { name: "Close details" }).click();
  const raceCard = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: race.name }) });
  await raceCard
    .getByRole("button", { name: `View details for ${race.name}` })
    .click();
  const raceDetails = page.getByRole("dialog", { name: race.name });
  await expect(
    raceDetails.locator(".server-details dd").filter({ hasText: "Race" }),
  ).toBeVisible();
  await expect(raceDetails.getByText("Password protected")).toBeVisible();
  await raceDetails.getByRole("button", { name: "Close details" }).click();
  expect(joins).toEqual([]);
  await card
    .getByRole("button", { name: `View details for ${practice.name}` })
    .click();
  const reopenedPractice = page.getByRole("dialog", { name: practice.name });
  await reopenedPractice
    .getByRole("button", { name: "Join server", exact: true })
    .click();
  await expect(
    page.getByText("Content Manager has been opened for this server."),
  ).toBeVisible();
  expect(joins).toEqual([
    { id: practice.id, method: "POST", body: { carId: "ec3_alternate_car" } },
  ]);
  expect(
    (await new AxeBuilder({ page }).exclude(".live-timing-frame").analyze())
      .violations,
  ).toEqual([]);
});

test("server cards use the matched circuit artwork and clean circuit name", async ({
  page,
}) => {
  const circuitImage = "https://assets.example.test/kyalami.jpg";
  await page.route("**/api/status", async (route) => {
    const response = await route.fetch();
    const snapshot = await response.json();
    const trackPackage = {
      id: "kyalami",
      name: "Kyalami",
      type: "track",
      version: "1.0.0",
      download: "https://assets.example.test/kyalami.zip",
      size: 1,
      sha256: "a".repeat(64),
      installPath: "content/tracks/vv_kyalami",
      required: true,
      files: [],
      dependencies: [],
      description: "Kyalami circuit",
      icon: null,
      image: circuitImage,
    };
    snapshot.catalog ??= {
      manifest: {
        championship: "Eurocup 3",
        season: "2026",
        build: "1.0.0",
        demo: false,
        content: [],
      },
      championship: {
        minimumHelperVersion: "1.0.0",
        requiredContent: [],
        events: [],
      },
      fetchedAt: checkedAt,
    };
    snapshot.catalog.manifest.content.push(trackPackage);
    await route.fulfill({ response, json: snapshot });
  });
  await page.route(circuitImage, (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#252932"/></svg>',
    }),
  );
  await mockFeatures(page, {
    servers: () => {
      const response = serverResponse();
      response.servers[0].info!.track = "Csp/3465/../D/.../vv_kyalami";
      return response;
    },
  });
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Servers", exact: true })
    .click();

  const card = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: practice.name }) });
  await expect(card.locator(".server-card-cover img")).toHaveAttribute(
    "src",
    circuitImage,
  );
  await expect(card.locator(".server-card-cover-bottom")).toContainText(
    "Kyalami",
  );
  await card
    .getByRole("button", { name: `View details for ${practice.name}` })
    .click();
  const details = page.getByRole("dialog", { name: practice.name });
  await expect(
    details.locator(".server-detail-option-artwork img"),
  ).toHaveAttribute("src", circuitImage);
  await expect(details.locator(".server-detail-option-copy strong")).toHaveText(
    "Kyalami",
  );
});

test("configured timing switches between an embedded view and an external page; sponsors retain their links and logo", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockFeatures(page, {
    portal: () => ({
      ...portalResponse(),
      sponsors: [
        {
          id: "fixture-partner",
          name: "Fixture Racing Partner",
          logo: "https://assets.example.test/partner.svg",
          url: "https://partner.example.test/",
          order: 1,
        },
      ],
    }),
  });
  await page.route("https://assets.example.test/partner.svg", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="60" viewBox="0 0 240 60"><rect width="240" height="60" fill="#dce3ed"/><text x="12" y="38" font-size="22" fill="#20232a">Fixture Racing</text></svg>',
    }),
  );
  await page.goto("/#servers");
  await page
    .getByRole("button", { name: `View details for ${practice.name}` })
    .click();
  const frame = page.locator(`iframe[title="${practice.name} live timing"]`);
  await expect(frame).toHaveAttribute("src", practice.liveTimingUrl!);
  await expect(frame).toHaveAttribute(
    "sandbox",
    "allow-scripts allow-same-origin",
  );
  await expect(frame).toHaveAttribute("referrerpolicy", "no-referrer");
  await frame.scrollIntoViewIfNeeded();
  await expect(
    page
      .frameLocator(`iframe[title="${practice.name} live timing"]`)
      .getByText("Configured live timing fixture"),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open full view" }).first(),
  ).toHaveAttribute("href", practice.liveTimingUrl!);
  await expect(page.locator("iframe.live-timing-frame")).toHaveCount(1);
  await expect(frame).toBeVisible();
  await page
    .getByRole("dialog", { name: practice.name })
    .getByRole("button", { name: "Close details" })
    .click();
  const raceCard = page.locator(".server-card").filter({ hasText: race.name });
  await raceCard
    .getByRole("button", { name: `View details for ${race.name}` })
    .click();
  const raceDetails = page.getByRole("dialog", { name: race.name });
  await expect(
    raceDetails.getByRole("link", { name: "Open full view" }),
  ).toHaveAttribute("href", race.liveTimingUrl!);
  await raceDetails.getByRole("button", { name: "Close details" }).click();
  await page
    .getByRole("button", { name: `View details for ${practice.name}` })
    .click();
  await page.screenshot({
    path: "artifacts/server-detail-dialog-1440.png",
    animations: "disabled",
  });
  await page
    .getByRole("dialog", { name: practice.name })
    .getByRole("button", { name: "Close details" })
    .click();
  const sponsor = page.getByRole("link", {
    name: "Fixture Racing Partner",
    exact: true,
  });
  await sponsor.scrollIntoViewIfNeeded();
  await expect(sponsor).toHaveAttribute(
    "href",
    "https://partner.example.test/",
  );
  await expect(sponsor).toHaveAttribute("target", "_blank");
  await expect(sponsor).toHaveAttribute("rel", "noopener noreferrer");
  const logo = sponsor.getByRole("img", { name: "Fixture Racing Partner" });
  await expect(logo).toBeVisible();
  await expect
    .poll(() =>
      logo.evaluate((image) => (image as HTMLImageElement).naturalWidth),
    )
    .toBe(240);
  const dimensions = await logo.boundingBox();
  expect(dimensions).not.toBeNull();
  expect(dimensions!.width / dimensions!.height).toBeCloseTo(4, 1);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "artifacts/servers-timing-sponsors-1440.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: `View details for ${practice.name}` })
    .click();
  const mobileDetails = page.getByRole("dialog", { name: practice.name });
  await expect(mobileDetails).toBeVisible();
  const dialogBounds = await mobileDetails.boundingBox();
  expect(dialogBounds).not.toBeNull();
  expect(dialogBounds!.width).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: "artifacts/server-detail-dialog-390.png",
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  expect(
    (await new AxeBuilder({ page }).exclude(".live-timing-frame").analyze())
      .violations,
  ).toEqual([]);
  await mobileDetails.getByRole("button", { name: "Close details" }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "artifacts/servers-timing-sponsors-390.png",
    fullPage: true,
    animations: "disabled",
  });
});

test("JSON live timing APIs render connected and offline leaderboards instead of an iframe", async ({
  page,
}) => {
  const apiUrl =
    "http://94.23.107.62:8772/api/live-timings/leaderboard.json?server=1";
  await mockFeatures(page, {
    portal: () => ({
      ...portalResponse(),
      teams: [
        {
          id: "ec3-racing",
          name: "EC3 Racing",
          color: "#e52e46",
          logo: "https://assets.example.test/ec3-logo.svg",
          driverNames: ["Carlos Leiva"],
          liveTimingNames: ["EC3 Racing"],
        },
        {
          id: "team-sixteen",
          name: "Team 16",
          color: "#3c9b81",
          logo: "https://assets.example.test/team-16.svg",
          driverNames: ["Samuel Fernández"],
          liveTimingNames: ["Team 16"],
        },
      ],
    }),
    servers: () => {
      const response = serverResponse();
      response.servers[0].server = {
        ...practice,
        liveTimingUrl: apiUrl,
        embedTiming: true,
      };
      return response;
    },
  });
  await page.goto("/#servers");
  await page
    .getByRole("button", { name: `View details for ${practice.name}` })
    .click();
  const connectedTable = page.getByRole("table", { name: "Connected drivers" });
  const offlineTable = page.getByRole("table", { name: "Offline drivers" });
  await expect(
    connectedTable.getByRole("row", { name: /Carlos Leiva/ }),
  ).toBeVisible();
  await expect(connectedTable.locator(".team-driver")).toContainText(
    "EC3 Racing",
  );
  await expect(connectedTable.locator(".team-driver")).toHaveAttribute(
    "style",
    "--team-color: #e52e46;",
  );
  await expect(
    offlineTable.getByRole("row", { name: /Samuel Fernández/ }),
  ).toBeVisible();
  await expect(offlineTable.locator(".team-driver")).toContainText("Team 16");
  await expect(page.getByText("Connected drivers")).toBeVisible();
  await expect(page.getByText("1:47.488")).toBeVisible();
  await expect(page.getByText("Offline drivers")).toBeVisible();
  await expect(page.getByText("1:48.123")).toBeVisible();
  await expect(page.locator("iframe.live-timing-frame")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Open JSON source" }),
  ).toHaveCount(0);
  expect(
    (await new AxeBuilder({ page }).exclude(".live-timing-frame").analyze())
      .violations,
  ).toEqual([]);
});

test("team marks appear consistently in home standings, Championship and race Results", async ({
  page,
}) => {
  const logo = "https://assets.example.test/ec3-team.svg";
  await mockFeatures(page, {
    portal: () => ({
      ...portalResponse(),
      teams: [
        {
          id: "ec3-racing",
          name: "EC3 Racing",
          color: "#e52e46",
          logo,
          driverNames: ["Fixture Driver"],
          liveTimingNames: [],
        },
      ],
    }),
  });
  await page.route("**/api/status", async (route) => {
    const response = await route.fetch();
    const snapshot = await response.json();
    snapshot.catalog.championship.resultsUrl =
      "https://www.makrobeasts.com/championships/fixture";
    await route.fulfill({ response, json: snapshot });
  });
  await page.route(`${api}/results**`, (route) =>
    route.fulfill({
      json: {
        sourceUrl: "https://www.makrobeasts.com/championships/fixture",
        updatedAt: checkedAt,
        standings: [
          { position: 1, number: "7", driver: "Fixture Driver", points: "25" },
        ],
        races: [
          {
            id: "round-one",
            round: "R1",
            name: "Round 1",
            venue: "Fixture Circuit",
            url: "https://www.makrobeasts.com/championships/fixture",
            sessions: [
              {
                name: "Race",
                results: [
                  {
                    position: 1,
                    number: "7",
                    driver: "Fixture Driver",
                    car: "EC3 Fixture Car",
                    time: "1:50.000",
                  },
                ],
              },
            ],
          },
        ],
      },
    }),
  );
  await page.route(logo, (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#fff"/></svg>',
    }),
  );
  await page.goto("/");
  await expect(page.locator(".standings-preview .team-driver")).toContainText(
    "EC3 Racing",
  );
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Championship", exact: true })
    .click();
  await expect(page.locator(".results-table .team-driver")).toContainText(
    "EC3 Racing",
  );
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Results", exact: true })
    .click();
  await expect(page.locator(".podium-row .team-driver")).toContainText(
    "EC3 Racing",
  );
});

test("missing Content Manager disables Join and a failed refresh labels preserved server data as last known", async ({
  page,
}) => {
  let failRefresh = false;
  await mockFeatures(page, {
    servers: () => serverResponse(false),
    serverFailure: () => failRefresh,
  });
  await page.goto("/#servers");
  await page
    .getByRole("button", { name: `View details for ${practice.name}` })
    .click();
  for (const button of await page
    .getByRole("button", { name: "Join server", exact: true })
    .all()) {
    await expect(button).toBeDisabled();
  }
  await expect(page.getByText("12 / 30", { exact: true })).toBeVisible();
  await page
    .getByRole("dialog", { name: practice.name })
    .getByRole("button", { name: "Close details" })
    .click();
  failRefresh = true;
  await page
    .getByRole("button", { name: "Refresh servers", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Server status could not be refreshed. Showing the last known server status.",
  );
  await expect(
    page.getByText("Last known online", { exact: true }),
  ).toHaveCount(2);
  await expect(
    page.locator(".server-card").filter({ hasText: practice.name }),
  ).toContainText("12 / 30 drivers");
});

test("an empty server catalog shows an explicit empty state without fabricated telemetry or sponsors", async ({
  page,
}) => {
  await mockFeatures(page, {
    servers: () => ({
      servers: [],
      contentManagerAvailable: false,
      errors: [],
      checkedAt,
    }),
    portal: () => ({ ...portalResponse(), servers: [], sponsors: [] }),
  });
  await page.goto("/#servers");
  await expect(
    page.getByText("No championship servers have been published yet.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Join server", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".server-details")).toHaveCount(0);
  await expect(page.locator("iframe.live-timing-frame")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Championship partners" }),
  ).toHaveCount(0);
});

test("app update dismissal persists for that release and a newer version creates a new notice", async ({
  page,
}) => {
  let version = "1.4.0";
  await mockFeatures(page, { update: () => publishedUpdate(version) });
  await page.goto("/?desktop=1");
  const notice = page.getByRole("region", { name: "Windows app update" });
  await expect(notice).toContainText("Eurocup 3 app 1.4.0 is available");
  await expect(notice).toContainText(
    "You have 1.3.0. Download and run the installer",
  );
  await expect(
    notice.getByRole("link", { name: "Download update" }),
  ).toHaveAttribute("href", publishedUpdate(version).downloadUrl!);
  await notice.getByText("What’s new in 1.4.0", { exact: true }).click();
  await expect(notice.getByText(/Improved server browsing/)).toBeVisible();
  await notice
    .getByRole("button", { name: "Dismiss app update 1.4.0 for this session" })
    .click();
  await expect(notice).toHaveCount(0);
  await page.goto("/?desktop=1#settings");
  await expect(
    page.getByText("Version 1.4.0 is available.", { exact: false }),
  ).toBeVisible();
  await expect(notice).toHaveCount(0);
  version = "1.5.0";
  await page
    .getByRole("button", { name: "Check for app updates", exact: true })
    .click();
  await expect(notice).toContainText("Eurocup 3 app 1.5.0 is available");
  await expect(notice).toContainText("You have 1.3.0.");
  await expect(
    notice.getByRole("link", { name: "Download update" }),
  ).toHaveAttribute("href", publishedUpdate(version).downloadUrl!);
});

test("a failed app update check reports uncertainty instead of claiming the latest version is installed", async ({
  page,
}) => {
  await mockFeatures(page, { updateFailure: () => true });
  await page.goto("/#settings");
  const unavailable = page.getByRole("region", { name: "App update check" });
  await expect(unavailable).toContainText("App update check unavailable");
  await expect(unavailable).toContainText(
    "The app update service is unavailable.",
  );
  await expect(
    unavailable.getByRole("button", { name: "Retry check" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("region", { name: "Windows app update" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("You have the latest published app.", { exact: false }),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Download update" })).toHaveCount(
    0,
  );
});
