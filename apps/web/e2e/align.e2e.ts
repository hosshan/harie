import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const fixture = readFileSync(
  new URL("../../../packages/format/fixtures/large-base.jpg", import.meta.url),
);

test("FR-EDIT-20: 選んだ注釈を揃え、等間隔に並べ、元に戻せる", async ({ page }) => {
  await page.goto("/");
  await page
    .getByLabel("画像ファイル")
    .setInputFiles({ name: "large-base.jpg", mimeType: "image/jpeg", buffer: fixture });
  const surface = page.getByRole("application", { name: "注釈の編集面" });
  await expect(surface).toBeVisible();
  const box = await surface.boundingBox();
  if (box === null) throw new Error("編集面がない");

  // 高さと間隔がばらばらな四角を 3 つ描く
  await page.keyboard.press("r");
  const draw = async (x0: number, y0: number, x1: number, y1: number) => {
    await page.mouse.move(box.x + box.width * x0, box.y + box.height * y0);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * x1, box.y + box.height * y1, { steps: 5 });
    await page.mouse.up();
  };
  await draw(0.1, 0.2, 0.2, 0.3);
  await draw(0.3, 0.45, 0.45, 0.55);
  await draw(0.75, 0.6, 0.85, 0.8);
  const rects = page.locator(".harie-canvas-image rect[stroke]");
  await expect(rects).toHaveCount(3);
  const attr = (name: string) =>
    rects.evaluateAll((els, n) => els.map((e) => Number(e.getAttribute(n))), name);

  await page.keyboard.press("v");
  await page.keyboard.press("ControlOrMeta+a");
  const align = page.getByRole("group", { name: "整列" });
  await align.getByRole("button", { name: "上揃え" }).click();
  const ys = await attr("y");
  expect(new Set(ys).size).toBe(1);

  // 左右に等間隔: 隣どうしのすき間が等しくなる
  await align.getByRole("button", { name: "左右に等間隔" }).click();
  const xs = await attr("x");
  const ws = await attr("width");
  const gaps = [1, 2].map((i) => (xs[i] ?? 0) - ((xs[i - 1] ?? 0) + (ws[i - 1] ?? 0)));
  expect(Math.abs((gaps[0] ?? 0) - (gaps[1] ?? 0))).toBeLessThanOrEqual(1);

  // 元に戻すで 1 段ずつ戻る
  await page.keyboard.press("ControlOrMeta+z");
  await page.keyboard.press("ControlOrMeta+z");
  expect(new Set(await attr("y")).size).toBe(3);
});
