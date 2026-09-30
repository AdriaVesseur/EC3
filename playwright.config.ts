import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:5183",
    browserName: "chromium",
    channel: "msedge",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "npm run dev",
      url: "http://127.0.0.1:5183",
      reuseExistingServer: true,
    },
    {
      command: "npm run demo",
      url: "http://127.0.0.1:32146/manifest.json",
      reuseExistingServer: true,
    },
  ],
});
