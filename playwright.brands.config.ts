import { defineConfig } from "@playwright/test";

// Identity and storage checks do not need a running helper or writable game data.
export default defineConfig({
  testDir: "./tests/browser",
  testMatch: ["branding.spec.ts", "active-championships.spec.ts"],
  workers: 1,
  timeout: 30000,
  outputDir: "test-results/brands",
  use: {
    browserName: "chromium",
    channel: "msedge",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
  },
  projects: [
    { name: "mkbt", use: { baseURL: "http://127.0.0.1:5191" } },
    { name: "epic", use: { baseURL: "http://127.0.0.1:5192" } },
  ],
  webServer: [
    {
      command: "npm run dev -- --mode mkbt --port 5191",
      url: "http://127.0.0.1:5191",
      reuseExistingServer: false,
      env: { VITE_APP_BRAND: "mkbt" },
    },
    {
      command: "npm run dev -- --mode epic --port 5192",
      url: "http://127.0.0.1:5192",
      reuseExistingServer: false,
      env: { VITE_APP_BRAND: "epic" },
    },
  ],
});
