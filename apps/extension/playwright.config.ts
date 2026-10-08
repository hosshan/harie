import { defineConfig } from "@playwright/test";

// 拡張は Chromium の永続コンテキストに読み込む（e2e/fixtures.ts）。ビルドは `HARIE_E2E=1 wxt build`（テスト用の権限付き）
export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.ts",
  timeout: 60_000,
  // 拡張の service worker と IndexedDB をテストごとに分けるため、並列にしない
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
});
