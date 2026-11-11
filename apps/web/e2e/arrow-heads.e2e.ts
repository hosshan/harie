import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const fixture = readFileSync(
  new URL("../../../packages/format/fixtures/large-base.jpg", import.meta.url),
);

test("FR-EDIT-19: 矢印の始端・終端の矢じりを右の欄で付け外しし、ただの線を描ける", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByLabel("画像ファイル")
    .setInputFiles({ name: "large-base.jpg", mimeType: "image/jpeg", buffer: fixture });
  const surface = page.getByRole("application", { name: "注釈の編集面" });
  await expect(surface).toBeVisible();
  const box = await surface.boundingBox();
  if (box === null) throw new Error("編集面がない");

  await page.keyboard.press("a");
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.5, { steps: 5 });
  await page.mouse.up();

  const polygons = page.locator(".harie-canvas-image polygon");
  await expect(polygons).toHaveCount(1);
  const start = page.getByRole("group", { name: "始端" });
  const end = page.getByRole("group", { name: "終端" });
  await expect(start.getByRole("button", { name: "なし" })).toHaveAttribute("aria-pressed", "true");
  await expect(end.getByRole("button", { name: "矢印" })).toHaveAttribute("aria-pressed", "true");

  // 終端の矢じりを外すと、ただの線になる
  await end.getByRole("button", { name: "なし" }).click();
  await expect(polygons).toHaveCount(0);
  await expect(page.locator(".harie-canvas-image line")).toHaveCount(1);

  // 始端だけに付け、両端に付ける
  await start.getByRole("button", { name: "矢印" }).click();
  await expect(polygons).toHaveCount(1);
  await end.getByRole("button", { name: "矢印" }).click();
  await expect(polygons).toHaveCount(2);

  // 元に戻すで 1 段ずつ戻る
  await page.keyboard.press("ControlOrMeta+z");
  await expect(polygons).toHaveCount(1);
});
