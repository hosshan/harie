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
