import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
test("real helper: install, verify corruption, repair, details and responsive layout", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByText("Online", { exact: true })).toBeVisible();
  await expect(page.getByText("ISOLATED TEST ENVIRONMENT")).toBeVisible();
  const prepare = page
    .getByRole("region", { name: "ONE GRID. ONE COMPLETE SETUP." })
    .getByRole("button");
  await expect(prepare).toBeEnabled();
  const updateResponse = page.waitForResponse(
    (r) => r.url().endsWith("/api/update") && r.request().method() === "POST",
  );
  await prepare.click();
  const queued = (await (await updateResponse).json()) as { id: string }[];
  await page.waitForResponse(async (r) => {
    if (!r.url().endsWith("/api/status") || r.status() !== 200) return false;
    const status = await r.json();
    return queued.every((j) =>
      status.jobs.some(
        (v: { id: string; state: string }) =>
          v.id === j.id && v.state === "complete",
      ),
    );
  });
  await expect(
    page.getByText("Every required package is verified and ready.", {
      exact: true,
    }),
  ).toBeVisible({ timeout: 30000 });
  const file = path.resolve(
    "work/demo/assettocorsa/content/tracks/ec3_barcelona/ec3-demo.txt",
  );
  expect(fs.existsSync(file)).toBeTruthy();
  fs.writeFileSync(file, "CORRUPTED BY INTEGRATION TEST");
  await page
    .getByRole("button", { name: "Verify all packages", exact: true })
    .click();
  await expect(prepare).toBeEnabled();
  await page
    .getByRole("link", { name: "Content library", exact: true })
    .click();
  await expect(
    page.getByText("Repair required", { exact: true }).first(),
  ).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "Repair", exact: true }).click();
  await expect(page.getByText("Repair required", { exact: true })).toHaveCount(
    0,
    { timeout: 15000 },
  );
  expect(fs.readFileSync(file, "utf8")).toContain("SAFE TEST FIXTURE");
  await page
    .getByRole("button", { name: "Barcelona GP", exact: false })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "files", exact: true }).click();
  await expect(page.getByText("ec3-demo.txt", { exact: true })).toBeVisible();
  await page.screenshot({
    path: "artifacts/package-details.png",
    fullPage: true,
    animations: "disabled",
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "Search content" })
    .fill("not a package");
  await expect(page.getByText("No matching packages")).toBeVisible();
  await page.getByRole("textbox", { name: "Search content" }).fill("");
  for (const [width, height] of [
    [1920, 1080],
    [1440, 900],
    [1366, 768],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("/#home");
    await expect(
      page.getByRole("heading", { name: "CONTENT HUB" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: `artifacts/overview-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("link", { name: "Content library", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "artifacts/library-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(errors).toEqual([]);
});
test("all application sections render without overflow or accessibility violations", async ({
  page,
}) => {
  for (const section of [
    "content",
    "championship",
    "downloads",
    "installation",
    "settings",
  ]) {
    await page.goto("/#" + section);
    await expect(page.getByText("Online", { exact: true })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: `artifacts/${section}-desktop.png`,
      fullPage: true,
      animations: "disabled",
    });
  }
});
test("the desktop shell hides the browser-only install link", async ({
  page,
}) => {
  await page.goto("/?desktop=1");
  await expect(page.getByRole("link", { name: "Install app" })).toHaveCount(0);

  await page.goto("/");
  await expect(page.getByRole("link", { name: "Install app" })).toBeVisible();
});
test("championship shows standings and results shows race classifications", async ({
  page,
}) => {
  await page.route("**/api/results**", (route) =>
    route.fulfill({
      json: {
        sourceUrl: "https://www.makrobeasts.com/championships/example",
        updatedAt: "2026-09-30T12:00:00Z",
        standings: [
          { position: 1, number: "16", driver: "Sofia Example", points: "42" },
        ],
        races: [
          {
            id: "event-1",
            round: "R1",
            name: "Round 1 | Example Circuit",
            venue: "Example Circuit",
            url: "https://www.makrobeasts.com/championships/example/events/event-1/results",
            sessions: [
              {
                name: "Race",
                results: [
                  {
                    position: 1,
                    number: "16",
                    driver: "Sofia Example",
                    car: "Porsche Cup",
                    time: "26:12.232",
                  },
                ],
              },
            ],
          },
        ],
      },
    }),
  );

  await page.goto("/#championship");
  await expect(
    page.getByRole("heading", { name: "Driver standings" }),
  ).toBeVisible();
  await expect(page.getByText("Sofia Example", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Race results" })).toHaveCount(
    0,
  );

  await page.getByRole("link", { name: "Results", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Race results" }),
  ).toBeVisible();
  await expect(page.getByText("Sofia Example", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Driver standings" }),
  ).toHaveCount(0);
});
test("downloads are inside Content and installation controls are in Settings", async ({
  page,
}) => {
  await page.goto("/#content");
  const contentNav = page.getByRole("navigation", { name: "Content sections" });
  await contentNav.getByRole("link", { name: "Downloads" }).click();
  await expect(page.getByRole("heading", { name: "Downloads." })).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Downloads" }),
  ).toHaveCount(0);

  await page.goto("/#settings");
  await expect(
    page.getByRole("heading", { name: "Assetto Corsa" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Custom Shaders Patch" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Installation" }),
  ).toHaveCount(0);

  await page.goto("/#installation");
  await expect(
    page.getByRole("heading", { name: "Your workspace." }),
  ).toBeVisible();
});
test("race readiness explains a missing catalog instead of showing false zeroes", async ({
  page,
}) => {
  await page.route("**/api/status", (route) =>
    route.fulfill({
      json: {
        version: "1.2.0",
        assettoPath: null,
        cspVersion: null,
        testMode: false,
        catalog: null,
        catalogError: "Package folders overlap.",
        content: [],
        jobs: [],
        raceReady: { ready: false, readyCount: 0, total: 0 },
      },
    }),
  );

  await page.goto("/");
  const readiness = page.getByRole("region", { name: "Race Ready" });
  await expect(readiness.getByText("Catalog unavailable")).toBeVisible();
  await expect(
    readiness.getByRole("button", { name: "Refresh catalog" }),
  ).toBeEnabled();
  await expect(readiness.getByText(/0\s*\/\s*—/)).toHaveCount(0);
  await expect(readiness.getByText(/0 packages left/)).toHaveCount(0);
  await page.screenshot({
    path: "artifacts/race-ready-catalog-unavailable.png",
    fullPage: true,
    animations: "disabled",
  });
});
test("offline state never reports race ready and provides installation action", async ({
  page,
}) => {
  await page.route("http://127.0.0.1:32145/api/**", (r) => r.abort());
  await page.goto("/");
  await expect(page.getByText("Offline", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Install EC3 Helper" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reconnect helper" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Download missing content" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Every required package is verified and ready.", {
      exact: true,
    }),
  ).toHaveCount(0);
  await page.screenshot({
    path: "artifacts/offline.png",
    fullPage: true,
    animations: "disabled",
  });
});
test("bundled production web connects to the same-origin helper", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:32145");
  await expect(page.getByText("Online", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "CONTENT HUB" }),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
