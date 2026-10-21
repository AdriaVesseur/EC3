import { expect, test, type Page, type Route } from "@playwright/test";
import type { Job, Snapshot } from "../../src/types";

const api = "http://127.0.0.1:32155/api";
const checkedAt = "2026-10-20T12:00:00Z";
const loadedCatalog: NonNullable<Snapshot["catalog"]> = {
  manifest: {
    championship: "Refresh regression championship",
    season: "2026",
    build: "1.4.1",
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

function job(state: string): Job {
  return {
    id: "content-operation",
    packageId: "fixture-car",
    name: "Fixture Car",
    action: state === "verifying" ? "verify" : "install",
    state,
    bytes: 200,
    total: 1000,
    bytesPerSecond: state === "downloading" ? 100 : 0,
    checkedFiles: 3,
    totalFiles: 10,
    error: null,
    createdAt: checkedAt,
  };
}

function snapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    version: "1.4.1",
    assettoPath: "C:\\Fixture\\assettocorsa",
    cspVersion: "0.2.11",
    testMode: false,
    catalog: loadedCatalog,
    catalogError: null,
    content: [],
    jobs: [],
    raceReady: { ready: false, readyCount: 0, total: 0 },
    ...overrides,
  };
}

async function mockHelper(
  page: Page,
  status: () => Snapshot,
  refresh: (route: Route) => Promise<void>,
) {
  const calls = { refresh: 0, status: 0 };
  await page.clock.install({ time: new Date(checkedAt) });
  await page.route(`${api}/**`, async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/api/session") {
      await route.fulfill({ json: { token: "refresh-regression-session" } });
    } else if (pathname === "/api/status") {
      calls.status++;
      await route.fulfill({ json: status() });
    } else if (pathname === "/api/refresh") {
      expect(route.request().method()).toBe("POST");
      calls.refresh++;
      await refresh(route);
    } else if (pathname === "/api/portal") {
      await route.fulfill({
        json: {
          servers: [],
          sponsors: [],
          teams: [],
          errors: [],
          fetchedAt: checkedAt,
        },
      });
    } else if (pathname === "/api/helper-update") {
      await route.fulfill({
        json: {
          currentVersion: "1.4.1",
          version: "1.4.1",
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
    } else if (pathname === "/api/results") {
      await route.fulfill({
        json: {
          sourceUrl: "https://www.makrobeasts.com/championships/fixture",
          updatedAt: checkedAt,
          standings: [],
          races: [],
        },
      });
    } else {
      await route.fulfill({
        status: 404,
        json: { message: "Unmocked helper request" },
      });
    }
  });
  return calls;
}

const refreshButtons = (page: Page) =>
  page.getByRole("button", { name: "Refresh catalog", exact: true });
const footerRefresh = (page: Page) =>
  page
    .locator(".main-footer")
    .getByRole("button", { name: "Refresh catalog", exact: true });
const errorBanner = (page: Page) => page.locator(".alert.error");

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "wait" });
});

test("startup waits for content operations to finish before its one catalog refresh", async ({
  page,
}) => {
  let current = snapshot({ catalog: null, jobs: [job("verifying")] });
  const calls = await mockHelper(
    page,
    () => current,
    async (route) => {
      current = snapshot({ jobs: [job("verifying")] });
      await route.fulfill({
        json: { catalog: loadedCatalog, refreshed: true },
      });
    },
  );
  await page.goto("/#home");
  const verification = page
    .getByRole("region", { name: "Race Ready" })
    .getByRole("status");
  await expect(verification).toContainText("Verifying content");
  await expect(verification.locator("svg")).toHaveClass(/spin/);
  await page.clock.runFor(6000);
  await expect.poll(() => calls.status).toBeGreaterThan(1);
  expect(calls.refresh).toBe(0);
  await expect(errorBanner(page)).toHaveCount(0);

  current = snapshot({ catalog: null, jobs: [job("complete")] });
  await page.clock.runFor(2100);
  await expect.poll(() => calls.refresh).toBe(1);
  await expect(page.locator(".toast")).toContainText("Catalog refreshed");
  await expect(errorBanner(page)).toHaveCount(0);
  await page.clock.runFor(6000);
  expect(calls.refresh).toBe(1);
});

for (const state of ["verifying", "paused", "downloading"] as const) {
  test(`every catalog refresh control is disabled while a job is ${state}`, async ({
    page,
  }) => {
    const current = snapshot({ catalog: null, jobs: [job(state)] });
    const calls = await mockHelper(
      page,
      () => current,
      (route) =>
        route.fulfill({ json: { catalog: loadedCatalog, refreshed: false } }),
    );
    await page.goto("/#home");
    await expect(page.locator(".online-status")).toHaveText("Online");
    await expect(
      page.getByRole("heading", { name: "Your grid is waiting" }),
    ).toBeVisible();
    for (const section of ["Home", "Content library", "Settings"] as const) {
      await page.getByRole("link", { name: section, exact: true }).click();
      await expect.poll(() => refreshButtons(page).count()).toBeGreaterThan(0);
      for (const button of await refreshButtons(page).all())
        await expect(button).toBeDisabled();
      if (section === "Home" && state === "verifying") {
        const verification = page
          .getByRole("region", { name: "Race Ready" })
          .getByRole("status");
        await expect(verification).toContainText("Verifying content");
        await expect(verification.locator("svg")).toHaveClass(/spin/);
      }
    }
    await page.clock.runFor(6000);
    expect(calls.refresh).toBe(0);
    await expect(errorBanner(page)).toHaveCount(0);
  });
}

test("a refresh that loses the idle race reports unchanged catalog without an error or success toast", async ({
  page,
}) => {
  let current = snapshot();
  const calls = await mockHelper(
    page,
    () => current,
    async (route) => {
      current = snapshot({ jobs: [job("verifying")] });
      await route.fulfill({
        json: { catalog: loadedCatalog, refreshed: false },
      });
    },
  );
  await page.goto("/#home");
  await expect(footerRefresh(page)).toBeEnabled();
  await footerRefresh(page).click();
  await expect(page.locator(".toast")).toHaveText(
    "Content operations are still running. The current catalog remains available.",
  );
  await expect(page.locator(".toast")).not.toContainText("Catalog refreshed");
  await expect(errorBanner(page)).toHaveCount(0);
  await expect(footerRefresh(page)).toBeDisabled();
  await expect(
    page.getByRole("region", { name: "Race Ready" }).getByRole("status"),
  ).toContainText("Verifying content");
  expect(calls.refresh).toBe(1);
});

test("rapid repeated refresh clicks submit only one request while the first is pending", async ({
  page,
}) => {
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let current = snapshot();
  const calls = await mockHelper(
    page,
    () => current,
    async (route) => {
      await pending;
      current = snapshot({ jobs: [job("verifying")] });
      await route.fulfill({
        json: { catalog: loadedCatalog, refreshed: true },
      });
    },
  );
  await page.goto("/#home");
  await expect(footerRefresh(page)).toBeEnabled();
  try {
    await footerRefresh(page).dblclick({ delay: 10 });
    await expect.poll(() => calls.refresh).toBe(1);
    for (const button of await refreshButtons(page).all())
      await expect(button).toBeDisabled();
    await refreshButtons(page).evaluateAll((buttons) => {
      for (const button of buttons) {
        (button as HTMLButtonElement).click();
        (button as HTMLButtonElement).click();
      }
    });
    expect(calls.refresh).toBe(1);
  } finally {
    finish();
  }
  await expect(page.locator(".toast")).toContainText("Catalog refreshed");
  expect(calls.refresh).toBe(1);
});

test("a genuine automatic refresh failure shows its error once without a retry loop", async ({
  page,
}) => {
  const current = snapshot({ catalog: null });
  const calls = await mockHelper(
    page,
    () => current,
    (route) =>
      route.fulfill({
        status: 503,
        json: { message: "Catalog service is temporarily unavailable." },
      }),
  );
  await page.goto("/#home");
  await expect(errorBanner(page)).toContainText(
    "Catalog service is temporarily unavailable.",
  );
  await expect.poll(() => calls.refresh).toBe(1);
  await page.clock.runFor(10000);
  expect(calls.refresh).toBe(1);
  await expect(errorBanner(page)).toContainText(
    "Catalog service is temporarily unavailable.",
  );
  await expect(page.locator(".toast")).toHaveCount(0);
  await expect(footerRefresh(page)).toBeEnabled();
});
