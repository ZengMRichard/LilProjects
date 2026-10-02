import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run against the built web app served by a demo-mode server that each test
// file starts itself (see e2e/server.ts), so a test can restart it.
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    acceptDownloads: true,
    viewport: { width: 1600, height: 900 },
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1600, height: 900 },
        launchOptions: { executablePath: process.env.PW_CHROMIUM || undefined },
      },
    },
  ],
});
