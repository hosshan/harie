import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";

const FIXTURES = new URL("../../../packages/format/fixtures/", import.meta.url);

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

async function openImage(page: Page) {
  await page.goto("/");
  await page.getByLabel("画像ファイル", { exact: true }).setInputFiles({
    name: "screen.jpg",
    mimeType: "image/jpeg",
    buffer: readFileSync(new URL("large-base.jpg", FIXTURES)),
  });
  await expect(page.locator(".app-file-name")).toHaveText("screen.jpg");
}

/** クリップボードの画像の形式と大きさ */
async function clipboardImage(page: Page) {
  return page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    if (item === undefined) return null;
    const blob = await item.getType("image/png");
    const bitmap = await createImageBitmap(blob);
    return { types: item.types, width: bitmap.width, height: bitmap.height };
  });
}

test("FR-FILE-11: 「コピー」で今の画像を PNG としてクリップボードに入れる（保存はしない）", async ({
  page,
}) => {
  await openImage(page);
  await page.getByRole("button", { name: "コピー" }).click();
  await expect(page.getByRole("status")).toContainText("画像をコピーしました");
  expect(await clipboardImage(page)).toEqual({
    types: ["image/png"],
    width: 520,
    height: 400,
  });
  // 保存していないので、ファイル名は開いたときのまま
  await expect(page.locator(".app-file-name")).toHaveText("screen.jpg");
});

test("FR-FILE-11, FR-EDIT-12: Ctrl / ⌘ + Shift + C でもコピーでき、ショートカット一覧に載る", async ({
  page,
}) => {
  await openImage(page);
  await page.keyboard.press("ControlOrMeta+Shift+C");
  await expect(page.getByRole("status")).toContainText("画像をコピーしました");
  expect(await clipboardImage(page)).toMatchObject({ width: 520, height: 400 });

  await page.keyboard.press("?");
  await expect(page.getByRole("dialog")).toContainText("画像をクリップボードにコピー");
});

test("FR-FILE-11: 狭い画面では三点メニューからコピーする", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openImage(page);
  await page.getByRole("button", { name: "その他の操作" }).click();
  await page.getByRole("menuitem", { name: "コピー" }).click();
  await expect(page.getByRole("status")).toContainText("画像をコピーしました");
});
