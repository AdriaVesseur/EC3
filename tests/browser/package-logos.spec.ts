import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";

test("package logos appear across lists and fall back when unavailable", async ({
  page,
}) => {
  const iconUrl = "https://images.example.test/car-logo.png";
  const missingIconUrl = "https://images.example.test/missing-logo.png";
  const libraryUrl = "http://127.0.0.1:32145/?desktop=1#content";
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
    }
    await route.fulfill({ response, json: snapshot });
  });
  const documentResponse = await page.goto(libraryUrl);
  expect(documentResponse?.headers()["content-security-policy"]).toContain(
    "img-src 'self' data: https:",
  );
  await expect(page.getByText("Online", { exact: true })).toBeVisible();
  const image = page.locator(".content-row .package-artwork img");
  await expect(image).toHaveCount(1);
  await expect(image).toHaveAttribute("src", iconUrl);
  await expect
    .poll(() => image.evaluate((el) => (el as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  await expect(page.locator(".content-row .package-artwork svg")).toHaveCount(
    packageCount - 1,
  );
  await page.screenshot({
    path: "artifacts/package-logos-content.png",
    animations: "disabled",
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

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
  await expect(page.locator(".content-row .package-artwork img")).toHaveCount(
    0,
  );
  await expect(page.locator(".content-row .package-artwork svg")).toHaveCount(
    packageCount,
  );
});
