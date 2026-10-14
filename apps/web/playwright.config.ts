import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: {
    baseURL: process.env.E2E_WEB_URL || "http://localhost:5173",
    trace: "retain-on-failure",
  },
  webServer: undefined, // start API + web yourself (see README § E2E), or set E2E_WEB_URL / E2E_API_URL
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
