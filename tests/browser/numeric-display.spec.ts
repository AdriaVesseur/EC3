import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const sourceUrl = "https://www.makrobeasts.com/championships/numeric-fixture";

async function configureNumericFixtures(
  page: Page,
  readyCount: number | null = 2,
) {
  await page.route("**/api/status", async (route) => {
    const response = await route.fetch();
    const snapshot = await response.json();
    const base = snapshot.content.find(
      (item: { package: { type: string } }) => item.package.type === "car",
    );
    if (!base || !snapshot.catalog) {
      await route.fulfill({ response, json: snapshot });
      return;
    }
    const content = [
      {
        id: "numeric-car-a",
        name: "Fixture Car A",
        type: "car",
        required: true,
      },
      {
        id: "numeric-car-b",
        name: "Fixture Car B",
        type: "car",
        required: true,
      },
      {
        id: "numeric-track",
        name: "Fixture Circuit",
        type: "track",
        required: false,
      },
    ].map((item) => ({
      ...base,
      state: "ready",
      installedVersion: base.package.version,
      package: { ...base.package, ...item, icon: null, image: null },
    }));
    snapshot.content = content;
    snapshot.jobs = [];
    snapshot.catalog.manifest.content = content.map((item) => item.package);
    snapshot.catalog.championship.requiredContent = [
      "numeric-car-a",
      "numeric-car-b",
    ];
    snapshot.catalog.championship.resultsUrl = sourceUrl;
    snapshot.raceReady = {
      ready: readyCount === 2,
      readyCount,
      total: 2,
      cspCompatible: true,
      helperCompatible: true,
    };
    await route.fulfill({ response, json: snapshot });
  });
  await page.route("**/api/results**", (route) =>
    route.fulfill({
      json: {
        sourceUrl,
        updatedAt: "2026-09-30T12:00:00Z",
        standings: [],
        races: [
          {
            id: "numeric-round-1",
            round: "R1",
            name: "Ronda 1 | Fixture Circuit",
            venue: "Fixture Circuit",
            url: `${sourceUrl}/events/round-1/results`,
            sessions: [{ name: "Race", results: [] }],
          },
        ],
      },
    }),
  );
  await page.route("**/api/portal**", (route) =>
    route.fulfill({
      json: {
        servers: [],
        sponsors: [],
        errors: [],
        fetchedAt: "2026-09-30T12:00:00Z",
      },
    }),
  );
  await page.route("**/api/helper-update**", (route) =>
    route.fulfill({
      json: {
        currentVersion: "1.3.1",
        version: "1.3.1",
        available: false,
        url: null,
        downloadUrl: null,
        notes: null,
        publishedAt: null,
        published: false,
        checkedAt: "2026-09-30T12:00:00Z",
        automaticInstall: false,
      },
    }),
  );
}

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "wait" });
});

test("readiness digits stay separated and the round badge preserves 01 on desktop and mobile", async ({
  page,
}) => {
  await configureNumericFixtures(page);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.goto("/?desktop=1#home");
    const readiness = page.getByRole("region", { name: "Race Ready" });
    await expect(
      readiness.getByRole("img", { name: "2 of 2 required packages verified" }),
    ).toBeVisible();
    await expect(readiness.locator(".race-ready-current")).toHaveText("2");
    await expect(readiness.locator(".race-ready-separator")).toHaveText("/");
    await expect(readiness.locator(".race-ready-total")).toHaveText("2");
    const current = (await readiness
      .locator(".race-ready-current")
      .boundingBox())!;
    const slash = (await readiness
      .locator(".race-ready-separator")
      .boundingBox())!;
    const total = (await readiness.locator(".race-ready-total").boundingBox())!;
    expect(slash.x - current.x - current.width).toBeGreaterThanOrEqual(4);
    expect(total.x - slash.x - slash.width).toBeGreaterThanOrEqual(4);
    expect(
      Math.abs(current.y + current.height - total.y - total.height),
    ).toBeLessThan(5);
    await readiness.screenshot({
      path: `artifacts/readiness-count-${width}.png`,
      animations: "disabled",
    });
    await page.getByRole("link", { name: "Results", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Ronda 1 | Fixture Circuit" }),
    ).toBeVisible();
    const badge = page.getByRole("img", { name: "Round 1", exact: true });
    await expect(badge).toHaveText("01");
    const badgeBox = (await badge.boundingBox())!;
    const numberBox = (await badge.locator("span").boundingBox())!;
    expect(badgeBox.width / badgeBox.height).toBeCloseTo(1, 1);
    expect(numberBox.x - badgeBox.x).toBeGreaterThan(4);
    expect(numberBox.y - badgeBox.y).toBeGreaterThan(4);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.locator(".race-result-heading").screenshot({
      path: `artifacts/round-badge-${width}.png`,
      animations: "disabled",
    });
  }
});

test("an unavailable verification count remains unknown instead of becoming zero", async ({
  page,
}) => {
  await configureNumericFixtures(page, null);
  await page.goto("/?desktop=1#home");
  const readiness = page.getByRole("region", { name: "Race Ready" });
  await expect(
    readiness.getByRole("img", {
      name: "Verification count unavailable for 2 required packages",
    }),
  ).toBeVisible();
  await expect(readiness.locator(".race-ready-current")).toHaveText("—");
  await expect(readiness.locator(".race-ready-total")).toHaveText("2");
  await expect(
    readiness.getByText("Verify packages to check your setup."),
  ).toBeVisible();
  await expect(
    readiness.getByText(/packages left to complete your setup/),
  ).toHaveCount(0);
});

test("content summary counts only packages within the active type and search filters", async ({
  page,
}) => {
  await configureNumericFixtures(page);
  await page.goto("/?desktop=1#content");
  const summary = page.locator(".library-summary > span");
  await expect(summary).toHaveText(/3 PACKAGES\s*·\s*3 UP TO DATE/);
  await page.getByRole("button", { name: "Cars", exact: true }).click();
  await expect(summary).toHaveText(/2 PACKAGES\s*·\s*2 UP TO DATE/);
  await page
    .getByRole("textbox", { name: "Search content", exact: true })
    .fill("Fixture Car A");
  await expect(summary).toHaveText(/1 PACKAGES\s*·\s*1 UP TO DATE/);
  await page
    .getByRole("textbox", { name: "Search content", exact: true })
    .fill("");
  await page.getByRole("button", { name: "Circuits", exact: true }).click();
  await expect(summary).toHaveText(/1 PACKAGES\s*·\s*1 UP TO DATE/);
});
