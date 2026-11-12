import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run the built web app against a real API with a throwaway data directory.
// Run `pnpm build` first. Set PW_CHROMIUM to use a preinstalled Chromium.
//
// `next build` bakes the /v1 proxy target into the build, so the API here listens on the port the
// build was made for (8787 unless FACET_API_URL was set at build time). Stop `pnpm dev` first.
const dataDir = process.env.FACET_E2E_DATA_DIR ?? mkdtempSync(join(tmpdir(), "facet-e2e-"));
const API_PORT = Number(new URL(process.env.FACET_API_URL ?? "http://127.0.0.1:8787").port);
const WEB_PORT = 3107;

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        launchOptions: { executablePath: process.env.PW_CHROMIUM || undefined },
      },
    },
  ],
  webServer: [
    {
      command: `uv run facet serve --port ${API_PORT}`,
      cwd: "../..",
      url: `http://127.0.0.1:${API_PORT}/v1/health`,
      reuseExistingServer: false,
      env: {
        FACET_DATA_DIR: dataDir,
        FACET_WEB_ORIGINS: `http://127.0.0.1:${WEB_PORT}`,
        FACET_WEB_URL: `http://127.0.0.1:${WEB_PORT}`,
      },
    },
    {
      command: `pnpm exec next start -p ${WEB_PORT}`,
      url: `http://127.0.0.1:${WEB_PORT}`,
      reuseExistingServer: false,
      env: { NEXT_TELEMETRY_DISABLED: "1" },
    },
  ],
});
