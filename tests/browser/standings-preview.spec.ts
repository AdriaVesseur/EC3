import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const sourceUrl = "https://www.makrobeasts.com/championships/example";
const standings = [
  { position: 6, number: "6", driver: "Sixth Driver", points: "19" },
  { position: 3, number: "3", driver: "Third Driver", points: "33" },
  { position: 1, number: "1", driver: "First Driver", points: "64" },
  { position: 5, number: "5", driver: "Fifth Driver", points: "27" },
  { position: 2, number: "2", driver: "Second Driver", points: "51" },
  { position: 4, number: "4", driver: "Fourth Driver", points: "31" },
];
async function configureSource(page: Page) {
  await page.route("**/api/status", async (route) => {
    const response = await route.fetch();
    const snapshot = await response.json();
    if (snapshot.catalog) snapshot.catalog.championship.resultsUrl = sourceUrl;
    await route.fulfill({ response, json: snapshot });
  });
}

test("Home previews the top five by position and links to full standings", async ({
  page,
}) => {
  await configureSource(page);
  await page.route("**/api/results**", (route) =>
    route.fulfill({
      json: {
        sourceUrl,
        updatedAt: "2026-09-30T12:00:00Z",
        standings,
        races: [],
      },
    }),
  );
  await page.goto("/?desktop=1#home");
  const preview = page.getByRole("region", { name: "Top 5 drivers" });
  await expect(preview.locator("tbody tr")).toHaveCount(5);
  await expect(preview.locator(".preview-driver")).toHaveText([
    "First Driver",
    "Second Driver",
    "Third Driver",
    "Fourth Driver",
    "Fifth Driver",
  ]);
  await expect(preview.locator(".preview-points")).toHaveText([
    "64",
    "51",
    "33",
    "31",
    "27",
  ]);
  await expect(preview.getByText("Sixth Driver")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Prepare for the next green light." }),
  ).toHaveCount(0);
  await preview.screenshot({
    path: "artifacts/home-top-five-desktop.png",
    animations: "disabled",
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await preview.getByRole("link", { name: "View full standings" }).click();
  await expect(
    page.getByRole("heading", { name: "Driver standings" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Championship readiness" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Prepare championship", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("Sixth Driver", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("link", { name: "Home", exact: true }).click();
  await expect(preview.locator("tbody tr")).toHaveCount(5);
  await preview.scrollIntoViewIfNeeded();
  await preview.screenshot({
    path: "artifacts/home-top-five-mobile.png",
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("Home can show standings while the content catalog is unavailable", async ({
  page,
}) => {
  await page.route("**/api/status", async (route) => {
    const response = await route.fetch();
    const snapshot = await response.json();
    snapshot.catalog = null;
    snapshot.catalogError = "Catalog unavailable in test";
    snapshot.content = [];
    await route.fulfill({ response, json: snapshot });
  });
  await page.route("**/api/results**", (route) =>
    route.fulfill({
      json: {
        sourceUrl,
        updatedAt: "2026-09-30T12:00:00Z",
        standings,
        races: [],
      },
    }),
  );
  await page.goto("/?desktop=1#home");
  await expect(
    page.getByRole("region", { name: "Top 5 drivers" }).locator("tbody tr"),
  ).toHaveCount(5);
});

for (const mode of ["empty", "unavailable"] as const) {
  test(`Home explains ${mode} standings`, async ({ page }) => {
    await configureSource(page);
    await page.route("**/api/results**", (route) =>
      mode === "empty"
        ? route.fulfill({
            json: {
              sourceUrl,
              updatedAt: "2026-09-30T12:00:00Z",
              standings: [],
              races: [],
            },
          })
        : route.fulfill({
            status: 503,
            json: { message: "Source unavailable" },
          }),
    );
    await page.goto("/?desktop=1#home");
    const preview = page.getByRole("region", { name: "Top 5 drivers" });
    await expect(
      preview.getByText(
        mode === "empty"
          ? "No driver standings have been published yet."
          : "Standings are temporarily unavailable. Open Championship to try again.",
      ),
    ).toBeVisible();
    await expect(preview.locator("tbody tr")).toHaveCount(0);
  });
}
