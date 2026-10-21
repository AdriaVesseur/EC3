import { expect, test, type Page, type Route } from "@playwright/test";
import type { ChampionshipResults, Package, Snapshot } from "../../src/types";

type BrandId = "mkbt" | "epic";
const identities = {
  mkbt: {
    name: "MKBT",
    appName: "MKBT Content Manager",
    apiPort: 32145,
    installerName: "MKBT-Content-Manager-Setup.exe",
  },
  epic: {
    name: "Epic Simracing",
    appName: "Epic Simracing Content Manager",
    apiPort: 32148,
    installerName: "EpicSimracing-Content-Manager-Setup.exe",
  },
} as const;
const checkedAt = "2026-10-20T12:00:00Z";
const official = "https://www.makrobeasts.com";
const sourceUrl = `${official}/championships/branding-fixture`;
const sponsorLogo = "https://assets.example.test/independent-sponsor.svg";
const fixturePackage: Package = {
  id: "branding-car",
  name: "Brand fixture car",
  type: "car",
  version: "1.0.0",
  download:
    "https://github.com/example/content/releases/download/fixture/car.zip",
  size: 100,
  sha256: "0".repeat(64),
  installPath: "content/cars/branding-car",
  required: true,
  files: [],
  dependencies: [],
  description: "A package used only to verify the content dialog identity.",
};
const status: Snapshot = {
  version: "1.6.0",
  assettoPath: "C:\\Fixture\\assettocorsa",
  cspVersion: "0.2.11",
  testMode: false,
  catalog: {
    manifest: {
      championship: "Brand fixture championship",
      season: "2026",
      build: "1.0.0",
      demo: false,
      content: [fixturePackage],
    },
    championship: {
      minimumHelperVersion: "1.0.0",
      resultsUrl: sourceUrl,
      requiredContent: [fixturePackage.id],
      events: [],
    },
    fetchedAt: checkedAt,
  },
  catalogError: null,
  content: [
    {
      package: fixturePackage,
      state: "ready",
      installedVersion: "1.0.0",
      checkedFiles: 1,
      invalidFiles: 0,
      verifiedAt: checkedAt,
    },
  ],
  jobs: [],
  raceReady: { ready: true, readyCount: 1, total: 1 },
};

function cachedResults(label: string): ChampionshipResults {
  return {
    sourceUrl,
    updatedAt: checkedAt,
    standings: [],
    races: [
      {
        id: "brand-cached-race",
        round: "R1",
        name: `${label} cached race`,
        venue: "Fixture circuit",
        url: sourceUrl,
        sessions: [
          {
            name: "Race 1",
            results: [
              {
                position: 1,
                number: "16",
                driver: `${label} cached driver`,
                car: "Fixture car",
                time: "30:00.000",
              },
            ],
          },
        ],
      },
    ],
  };
}

async function mockHelper(
  page: Page,
  brand: BrandId,
  options: {
    availableUpdate?: boolean;
    sessionBrand?: BrandId;
    results?: (route: Route) => Promise<void>;
  } = {},
) {
  const identity = identities[brand];
  const requests: string[] = [];
  await page.clock.setFixedTime(new Date(checkedAt));
  await page.route(sponsorLogo, (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="30"><path fill="white" d="M0 0h100v30H0z"/></svg>',
    }),
  );
  // Intercept either brand endpoint so an accidental cross-brand API request fails clearly.
  await page.route(
    /^http:\/\/127\.0\.0\.1:(32145|32148)\/api\//,
    async (route) => {
      const url = new URL(route.request().url());
      requests.push(url.href);
      expect(url.port).toBe(String(identity.apiPort));
      if (url.pathname === "/api/session") {
        await route.fulfill({
          json: {
            token: `${brand}-fixture-session`,
            version: "1.6.0",
            brand: options.sessionBrand ?? brand,
          },
        });
      } else if (url.pathname === "/api/status") {
        if (options.sessionBrand && options.sessionBrand !== brand) {
          await route.fulfill({
            status: 401,
            json: { message: "Session is not authorized for this helper." },
          });
        } else await route.fulfill({ json: status });
      } else if (url.pathname === "/api/portal") {
        await route.fulfill({
          json: {
            servers: [],
            // A published sponsor keeps its own logo even when its legacy id is ec3.
            sponsors: [
              {
                id: "ec3",
                name: "Independent sponsor",
                logo: sponsorLogo,
                url: "https://example.test/sponsor",
                order: 0,
              },
            ],
            teams: [],
            errors: [],
            fetchedAt: checkedAt,
          },
        });
      } else if (url.pathname === "/api/helper-update") {
        await route.fulfill({
          json: {
            currentVersion: "1.6.0",
            version: options.availableUpdate ? "9.0.0" : "1.6.0",
            available: !!options.availableUpdate,
            url: options.availableUpdate
              ? "https://github.com/example/app/releases/tag/app-v9.0.0"
              : null,
            downloadUrl: options.availableUpdate
              ? `https://github.com/example/app/releases/download/app-v9.0.0/${identity.installerName}`
              : null,
            notes: options.availableUpdate ? "Brand-specific installer." : null,
            publishedAt: options.availableUpdate ? checkedAt : null,
            published: !!options.availableUpdate,
            checkedAt,
            automaticInstall: false,
          },
        });
      } else if (url.pathname === "/api/championships") {
        expect(brand).toBe("mkbt");
        await route.fulfill({
          json: {
            sourceUrl: `${official}/championships`,
            updatedAt: checkedAt,
            championships: [
              {
                id: "branding-fixture",
                name: "Brand fixture championship",
                url: sourceUrl,
                image: null,
                status: "active",
              },
            ],
            warnings: [],
          },
        });
      } else if (
        url.pathname === "/api/championships/branding-fixture/details"
      ) {
        expect(brand).toBe("mkbt");
        await route.fulfill({
          json: {
            championshipId: "branding-fixture",
            sourceUrl,
            updatedAt: checkedAt,
            description: null,
            participants: [],
            calendar: [],
            warnings: [],
          },
        });
      } else if (
        url.pathname === "/api/results" ||
        url.pathname === "/api/championships/branding-fixture/results"
      ) {
        if (options.results) await options.results(route);
        else
          await route.fulfill({
            json: { sourceUrl, updatedAt: checkedAt, standings: [], races: [] },
          });
      } else if (url.pathname === "/api/races") {
        await route.fulfill({
          json: {
            sourceUrl: `${official}/championships/calendar`,
            updatedAt: checkedAt,
            timeZone: "Europe/Madrid",
            warnings: [],
            races: [
              {
                id: "brand-fixture-race",
                name: "Brand fixture race",
                championship: "Brand fixture series",
                kind: "championship",
                startAt: "2026-10-21T18:00:00Z",
                dateLabel: "21 OCT 2026",
                track: "Barcelona GP",
                car: "Formula 3",
                image: null,
                url: sourceUrl,
                registrationUrl: `${sourceUrl}#registration`,
                status: "upcoming",
                registrationStatus: "open",
                registered: 20,
                capacity: 30,
                license: "Rookie",
                format: "Two races",
              },
            ],
          },
        });
      } else {
        await route.fulfill({
          status: 404,
          json: { message: "Unmocked brand fixture request" },
        });
      }
    },
  );
  return requests;
}

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "wait" });
});

test("brand identity stays consistent across Home, navigation, content details and installer links", async ({
  page,
}, testInfo) => {
  const id = testInfo.project.name as BrandId;
  const identity = identities[id];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const requests = await mockHelper(page, id);
  await page.goto("/");
  await expect(page).toHaveTitle(identity.appName);
  await expect(page.locator("html")).toHaveAttribute("data-brand", id);
  const brandLink = page.getByRole("link", {
    name: `${identity.name} home`,
    exact: true,
  });
  await expect(brandLink).toBeVisible();
  await expect(brandLink.locator("img")).toHaveAttribute(
    "src",
    `./brands/${id}/logo.png`,
  );
  await expect
    .poll(() =>
      brandLink
        .locator("img")
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBeGreaterThan(0);
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    "href",
    `./brands/${id}/app.ico`,
  );
  await expect(
    page.getByRole("main", { name: `${identity.name} portal` }),
  ).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await expect(nav.getByRole("link")).toHaveCount(7);
  await expect(
    page.getByRole("combobox", { name: /brand|marca|version/i }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: /switch brand|change brand|cambiar marca/i,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Install app", exact: true }),
  ).toHaveAttribute("href", `./helper/${id}/${identity.installerName}`);
  await expect(
    page.getByRole("img", { name: "Independent sponsor", exact: true }),
  ).toHaveAttribute("src", sponsorLogo);
  await nav.getByRole("link", { name: "Content library", exact: true }).click();
  await page
    .getByRole("button", { name: fixturePackage.name, exact: false })
    .first()
    .click();
  const dialog = page.getByRole("dialog", {
    name: fixturePackage.name,
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".eyebrow")).toContainText(
    identity.name.toUpperCase(),
  );
  await page.keyboard.press("Escape");
  await nav.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(
    page.getByText(`127.0.0.1:${identity.apiPort}`, { exact: true }),
  ).toBeVisible();
  await expect(brandLink).toBeVisible();
  expect(requests.some((url) => url.endsWith("/session"))).toBe(true);
  expect(errors).toEqual([]);
});

test("favourites and cached classifications ignore the parallel brand's storage", async ({
  page,
}, testInfo) => {
  const id = testInfo.project.name as BrandId;
  const other: BrandId = id === "mkbt" ? "epic" : "mkbt";
  let releaseResults!: () => void;
  const resultsGate = new Promise<void>((resolve) => {
    releaseResults = resolve;
  });
  await mockHelper(page, id, {
    results: async (route) => {
      await resultsGate;
      await route.fulfill({ json: cachedResults(id) });
    },
  });
  await page.addInitScript(
    ({ id, other, own, foreign }) => {
      localStorage.setItem(
        `${id}:championship-results:v1`,
        JSON.stringify(own),
      );
      localStorage.setItem(
        `${id}:active-championship:v1`,
        JSON.stringify("branding-fixture"),
      );
      localStorage.setItem(
        `${id}:championship-results:branding-fixture:v1`,
        JSON.stringify({ value: own, at: Date.now() - 600000 }),
      );
      localStorage.setItem(
        `${other}:championship-results:v1`,
        JSON.stringify(foreign),
      );
      localStorage.setItem(
        `${other}:championship-results:branding-fixture:v1`,
        JSON.stringify({ value: foreign, at: Date.now() - 600000 }),
      );
      localStorage.setItem(
        `${other}:races:favourites:v1`,
        JSON.stringify(["series:Brand fixture series"]),
      );
      // The predecessor's cache must not leak into either new branded profile.
      localStorage.setItem(
        "eurocup3:championship-results:v1",
        JSON.stringify(foreign),
      );
    },
    { id, other, own: cachedResults(id), foreign: cachedResults(other) },
  );
  try {
    await page.goto("/#results");
    if (id === "mkbt") {
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await page
        .getByRole("button", {
          name: "Open Brand fixture championship",
          exact: true,
        })
        .click();
      await page.getByRole("tab", { name: "Results", exact: true }).click();
    }
    await expect(
      page.getByText(`${id} cached race`, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(`${other} cached race`, { exact: true }),
    ).toHaveCount(0);
    releaseResults();
    if (id === "mkbt") {
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Races", exact: true })
      .click();
    const favourite = page.getByRole("button", {
      name: "Favourite Brand fixture series",
      exact: true,
    });
    await expect(favourite).toHaveAttribute("aria-pressed", "false");
    await favourite.click();
    await expect(favourite).toHaveAttribute("aria-pressed", "true");
    const stored = await page.evaluate(
      ({ id, other }) => ({
        own: JSON.parse(
          localStorage.getItem(`${id}:races:favourites:v1`) ?? "null",
        ),
        other: JSON.parse(
          localStorage.getItem(`${other}:races:favourites:v1`) ?? "null",
        ),
      }),
      { id, other },
    );
    expect(stored.own).toEqual(["series:Brand fixture series"]);
    expect(stored.other).toEqual(["series:Brand fixture series"]);
    await page.reload();
    await expect(favourite).toHaveAttribute("aria-pressed", "true");
  } finally {
    releaseResults();
  }
});

test("update notices use this brand's installer and independent dismissal state", async ({
  page,
}, testInfo) => {
  const id = testInfo.project.name as BrandId;
  const other: BrandId = id === "mkbt" ? "epic" : "mkbt";
  const identity = identities[id];
  await mockHelper(page, id, { availableUpdate: true });
  await page.addInitScript((other) => {
    sessionStorage.setItem(
      `${other}:app-update-dismissed-versions`,
      JSON.stringify(["9.0.0"]),
    );
  }, other);
  await page.goto("/");
  const notice = page.getByRole("region", {
    name: "Windows app update",
    exact: true,
  });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText(identity.name);
  await expect(
    notice.getByRole("link", { name: "Download update", exact: true }),
  ).toHaveAttribute(
    "href",
    new RegExp(`/${identity.installerName.replaceAll(".", "\\.")}$`),
  );
  await notice
    .getByRole("button", { name: "Dismiss app update 9.0.0 for this session" })
    .click();
  await expect(notice).toHaveCount(0);
  expect(
    await page.evaluate(
      (id) =>
        JSON.parse(
          sessionStorage.getItem(`${id}:app-update-dismissed-versions`) ?? "[]",
        ),
      id,
    ),
  ).toEqual(["9.0.0"]);
  await page.reload();
  await expect(page.getByText("Online", { exact: true })).toBeVisible();
  await expect(notice).toHaveCount(0);
});

test("a helper for the parallel brand cannot connect this launcher", async ({
  page,
}, testInfo) => {
  const id = testInfo.project.name as BrandId;
  const other: BrandId = id === "mkbt" ? "epic" : "mkbt";
  await mockHelper(page, id, { sessionBrand: other });
  await page.goto("/");
  await expect(
    page.getByText("Offline", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.locator(".alert.error")).toContainText(
    identities[id].appName,
  );
  await expect(page.getByText("Online", { exact: true })).toHaveCount(0);
});

for (const width of [1440, 320]) {
  test(`branded Home and library fit ${width}px`, async ({
    page,
  }, testInfo) => {
    const id = testInfo.project.name as BrandId;
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 1000 });
    await mockHelper(page, id);
    await page.goto("/?desktop=1");
    await expect(page.getByText("Online", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Install app", exact: true }),
    ).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);
    const homeLink = page.getByRole("link", {
      name: `${identities[id].name} home`,
      exact: true,
    });
    await expect(homeLink).toBeVisible();
    const logoBounds = await homeLink.boundingBox();
    expect(logoBounds?.height).toBeGreaterThan(10);
    expect(logoBounds?.width).toBeGreaterThan(20);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `artifacts/brands/${id}-home-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Content library", exact: true })
      .click();
    await expect(
      page
        .getByRole("button", { name: fixturePackage.name, exact: false })
        .first(),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `artifacts/brands/${id}-library-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    expect(errors).toEqual([]);
  });
}
