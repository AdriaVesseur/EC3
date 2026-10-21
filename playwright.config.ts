import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  // Existing feature coverage exercises Epic's manifest-selected championship.
  // MKBT's competition catalog and cross-brand isolation use the brands config.
  testIgnore: ["branding.spec.ts", "active-championships.spec.ts"],
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:5185",
    browserName: "chromium",
    channel: "msedge",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "npm run dev -- --port 5185",
      url: "http://127.0.0.1:5185",
      env: {
        VITE_APP_BRAND: "epic",
        VITE_EC3_API_URL: "http://127.0.0.1:32155/api",
      },
      reuseExistingServer: false,
    },
    {
      command:
        "npm run build && npm run helper:build -- -p:AppBrand=Epic && npm run demo",
      url: "http://127.0.0.1:32146/manifest.json",
      env: {
        EC3_TEST_API_PORT: "32155",
        VITE_APP_BRAND: "epic",
        VITE_EC3_API_URL: "http://127.0.0.1:32155/api",
      },
      reuseExistingServer: false,
    },
  ],
});
