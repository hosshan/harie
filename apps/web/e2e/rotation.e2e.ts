import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const fixture = readFileSync(
  new URL("../../../packages/format/fixtures/large-base.jpg", import.meta.url),
);

test("FR-EDIT-21: 回転のつまみで四角を回し、元に戻せる", async ({ page }) => {
  await page.goto("/");
  await page
    .getByLabel("画像ファイル")
    .setInputFiles({ name: "large-base.jpg", mimeType: "image/jpeg", buffer: fixture });
  const surface = page.getByRole("application", { name: "注釈の編集面" });
  await expect(surface).toBeVisible();
  const box = await surface.boundingBox();
  if (box === null) throw new Error("編集面がない");

  // 四角を描く（描いた四角が選ばれ、回転のつまみが出る）
  await page.keyboard.press("r");
  const [x0, y0] = [box.x + box.width * 0.35, box.y + box.height * 0.4];
  const [x1, y1] = [box.x + box.width * 0.65, box.y + box.height * 0.6];
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move(x1, y1, { steps: 5 });
  await page.mouse.up();

  const grip = page.locator(".harie-handle-rotate");
  await expect(grip).toHaveCount(1);
  const g = await grip.boundingBox();
  if (g === null) throw new Error("回転のつまみがない");

  // つまみを中心の右へ動かすと 90° 回る
  const center = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(center.x + 200, center.y + 2, { steps: 8 });
  await page.mouse.up();

  const rotated = page.locator('.harie-canvas-image g[transform^="rotate(90 "] > rect');
  await expect(rotated).toHaveCount(1);
  await expect(page.locator('.harie-selection[data-rotation="90"]')).toHaveCount(1);

  // 元に戻すと回す前に戻る
  await page.keyboard.press("ControlOrMeta+z");
  await expect(rotated).toHaveCount(0);
});

test("FR-EDIT-22: 右の欄のボタンで 90° 回転・反転する", async ({ page }) => {
  await page.goto("/");
  await page
    .getByLabel("画像ファイル")
    .setInputFiles({ name: "large-base.jpg", mimeType: "image/jpeg", buffer: fixture });
  const surface = page.getByRole("application", { name: "注釈の編集面" });
  await expect(surface).toBeVisible();
  const box = await surface.boundingBox();
  if (box === null) throw new Error("編集面がない");

  // 矢印を描く（左から右へ）
  await page.keyboard.press("a");
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.5, { steps: 5 });
  await page.mouse.up();

  const line = page.locator(".harie-canvas-image line");
  const x1 = Number(await line.getAttribute("x1"));
  const x2 = Number(await line.getAttribute("x2"));
  expect(x1).toBeLessThan(x2);

  // 左右に反転すると向きが逆になる
  await page.getByRole("button", { name: "左右に反転" }).click();
  await expect
    .poll(async () => Number(await line.getAttribute("x1")))
    .toBeGreaterThan(Number(await line.getAttribute("x2")));

  // 右に 90° 回すと縦になる
  await page.getByRole("button", { name: "右に 90° 回転" }).click();
  await expect
    .poll(async () =>
      Math.abs(Number(await line.getAttribute("x1")) - Number(await line.getAttribute("x2"))),
    )
    .toBeLessThan(2);
});
