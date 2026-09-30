import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
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
      env: { VITE_EC3_API_URL: "http://127.0.0.1:32155/api" },
      reuseExistingServer: false,
    },
    {
      command: "npm run build && npm run helper:build && npm run demo",
      url: "http://127.0.0.1:32146/manifest.json",
      env: {
        EC3_TEST_API_PORT: "32155",
        VITE_EC3_API_URL: "http://127.0.0.1:32155/api",
      },
      reuseExistingServer: false,
    },
  ],
});
