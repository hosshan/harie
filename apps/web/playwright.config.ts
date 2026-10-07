import { defineConfig, devices } from "@playwright/test";

// ローカル（クラウド開発環境）では同梱の Chromium を使う。CI では `playwright install` したものを使う
const executablePath = process.env.ANOI_CHROMIUM_PATH;

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.ts",
  timeout: 60_000,
  fullyParallel: true,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:4173",
    acceptDownloads: true,
    ...devices["Desktop Chrome"],
    ...(executablePath === undefined ? {} : { launchOptions: { executablePath } }),
  },
  webServer: {
    command: "pnpm build && pnpm preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
