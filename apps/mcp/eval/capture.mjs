// お題のスクリーンショットと正解の矩形（data-gt を付けた要素）を作る
// 使い方: node apps/mcp/eval/capture.mjs  → fixtures/notifications.png と fixtures/ground-truth.json
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "fixtures");
// Playwright は apps/web の devDependencies にあるので、そこから読み込む（apps/mcp の依存を増やさない）
const { chromium } = createRequire(join(here, "../../web/package.json"))("@playwright/test");

const browser = await chromium.launch(
  process.env.HARIE_CHROMIUM_PATH ? { executablePath: process.env.HARIE_CHROMIUM_PATH } : {},
);
const page = await browser.newPage({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
});
await page.goto(pathToFileURL(join(fixtures, "notifications.html")).href);
await page.screenshot({ path: join(fixtures, "notifications.png") });
const boxes = await page.$$eval("[data-gt]", (els) =>
  Object.fromEntries(
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return [el.dataset.gt, { x: r.x, y: r.y, w: r.width, h: r.height }];
    }),
  ),
);
writeFileSync(
  join(fixtures, "ground-truth.json"),
  `${JSON.stringify({ width: 1280, height: 720, boxes }, null, 2)}\n`,
);
await browser.close();
console.log(boxes);
