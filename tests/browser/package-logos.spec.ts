import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "wait" });
});

test("package photos and logos render in the grid and fall back when unavailable", async ({
  page,
}) => {
  const iconUrl = "https://images.example.test/car-logo.png";
  const missingIconUrl = "https://images.example.test/missing-logo.png";
  const photoUrl = "https://images.example.test/car-photo.jpg";
  const missingPhotoUrl = "https://images.example.test/missing-photo.jpg";
  const libraryUrl = "http://127.0.0.1:32155/?desktop=1#content";
  let broken = false;
  let targetId = "";
  let packageCount = 0;
  await page.route(iconUrl, async (route) => {
    await route.fulfill({
      contentType: "image/png",
      body: fs.readFileSync(path.resolve("public/images/logo-dark.png")),
    });
  });
  await page.route(missingIconUrl, (route) =>
    route.fulfill({ status: 404, body: "Not found" }),
  );
  await page.route(photoUrl, (route) =>
    route.fulfill({
      contentType: "image/jpeg",
      body: fs.readFileSync(
        path.resolve("content-repository/images/test-car.jpg"),
      ),
    }),
  );
  await page.route(missingPhotoUrl, (route) =>
    route.fulfill({ status: 404, body: "Not found" }),
  );
  await page.route("**/api/status", async (route) => {
    const response = await route.fetch();
    const snapshot = await response.json();
    if (!snapshot.content.length) {
      await route.fulfill({ response, json: snapshot });
      return;
    }
    targetId ||= snapshot.content[0].package.id;
    packageCount = snapshot.content.length;
    for (const item of snapshot.content) {
      item.package.icon =
        item.package.id === targetId
          ? broken
            ? missingIconUrl
            : iconUrl
          : null;
      item.package.image =
        item.package.id === targetId
          ? broken
            ? missingPhotoUrl
            : photoUrl
          : null;
    }
    await route.fulfill({ response, json: snapshot });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  const documentResponse = await page.goto(libraryUrl);
  expect(documentResponse?.headers()["content-security-policy"]).toContain(
    "img-src 'self' data: https:",
  );
  await expect(page.getByText("Online", { exact: true })).toBeVisible();
  const photo = page.locator(".content-card-photo");
  await expect(photo).toHaveCount(1);
  await expect(photo).toHaveAttribute("src", photoUrl);
  await expect
    .poll(() => photo.evaluate((el) => (el as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  await expect(page.locator(".content-card-placeholder")).toHaveCount(
    packageCount - 1,
  );
  await expect(
    page.getByRole("link", { name: "Eurocup 3 home", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".brand")).not.toContainText("Content Hub");
  const image = page.locator(".content-card .package-artwork img");
  await expect(image).toHaveCount(1);
  await expect(image).toHaveAttribute("src", iconUrl);
  await expect
    .poll(() => image.evaluate((el) => (el as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  await expect(page.locator(".content-card .package-artwork svg")).toHaveCount(
    packageCount - 1,
  );
  await page.screenshot({
    path: "artifacts/package-logos-content.png",
    animations: "disabled",
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "artifacts/content-grid-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.getByRole("link", { name: "Home", exact: true }).click();
  const homeImages = page.locator(".package-artwork img");
  await expect(homeImages).toHaveCount(2);
  for (const homeImage of await homeImages.all()) {
    await homeImage.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        homeImage.evaluate((el) => (el as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);
  }

  broken = true;
  await page.goto(libraryUrl);
  await expect(page.getByText("Online", { exact: true })).toBeVisible();
  await expect(page.locator(".content-card .package-artwork img")).toHaveCount(
    0,
  );
  await expect(page.locator(".content-card .package-artwork svg")).toHaveCount(
    packageCount,
  );
  await expect(page.locator(".content-card-photo")).toHaveCount(0);
  await expect(page.locator(".content-card-placeholder")).toHaveCount(
    packageCount,
  );
});
