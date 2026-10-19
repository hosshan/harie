import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";

const fixture = readFileSync(
  new URL("../../../packages/format/fixtures/large-base.jpg", import.meta.url),
);

async function open(page: Page) {
  await page.goto("/");
  await page
    .getByLabel("画像ファイル")
    .setInputFiles({ name: "large-base.jpg", mimeType: "image/jpeg", buffer: fixture });
  await expect(page.getByRole("application", { name: "注釈の編集面" })).toBeVisible();
  await page.waitForFunction(
    () =>
      document.fonts.status === "loaded" &&
      [...document.fonts].every((f) => f.status !== "loading"),
  );
}

/** 画像の座標（520x400）で編集面をドラッグする */
async function drag(page: Page, from: [number, number], to: [number, number]) {
  const box = await page.getByRole("application", { name: "注釈の編集面" }).boundingBox();
  if (box === null) throw new Error("編集面がない");
  const k = Math.min(box.width / 520, box.height / 400);
  const at = (p: [number, number]) =>
    [
      box.x + (box.width - 520 * k) / 2 + p[0] * k,
      box.y + (box.height - 400 * k) / 2 + p[1] * k,
    ] as const;
  await page.mouse.move(...at(from));
  await page.mouse.down();
  await page.mouse.move(...at([(from[0] + to[0]) / 2, (from[1] + to[1]) / 2]));
  await page.mouse.move(...at(to));
  await page.mouse.up();
}

test("FR-EDIT-12: 道具の切り替え・複製・矢印キーで動かす・重なりの順・元に戻すをキーで行える", async ({
  page,
}) => {
  await open(page);
  // R で四角の道具にして描く
  await page.keyboard.press("r");
  await expect(page.getByRole("button", { name: "四角" })).toHaveAttribute("aria-pressed", "true");
  await drag(page, [40, 40], [140, 100]);
  const first = page.locator(".harie-canvas-image rect").first();
  const x = async () => Number(await first.getAttribute("x"));
  const x0 = await x();

  // 矢印キーで 1px、Shift で 10px 動かす
  await page.keyboard.press("ArrowRight");
  await expect.poll(x).toBe(x0 + 1);
  await page.keyboard.press("Shift+ArrowRight");
  await expect.poll(x).toBe(x0 + 11);
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(x).toBe(x0 + 1);

  // 複製すると、ずらした複製が選ばれる
  await page.keyboard.press("ControlOrMeta+d");
  const all = page.locator(".harie-canvas-image rect");
  await expect(all).toHaveCount(2);
  await expect.poll(async () => Number(await all.nth(1).getAttribute("x"))).toBe(x0 + 17);

  // 複製（上）を最背面へ
  await page.getByRole("button", { name: "赤" }).click();
  await page.keyboard.press("ControlOrMeta+Shift+BracketLeft");
  await expect(all.nth(0)).toHaveAttribute("stroke", "#E5484D");

  // Esc で選択を外し、Ctrl / ⌘ + A ですべて選んで消す
  await page.keyboard.press("Escape");
  await expect(page.getByText("注釈を選ぶと、ここで文字や色を変えられます。")).toBeVisible();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Delete");
  await expect(all).toHaveCount(0);
});

test("FR-EDIT-12: Enter で吹き出しの文字を編集し、コピーと貼り付けで注釈を増やせる", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page);
  await page.keyboard.press("c");
  await drag(page, [60, 60], [60, 60]);
  const editor = page.getByRole("textbox", { name: "テキストを編集" });
  await editor.fill("通知を設定します");
  await editor.press("ControlOrMeta+Enter");
  await expect(editor).toHaveCount(0);
  // 選んだまま Enter で、もう一度その場で直せる
  await page.keyboard.press("Enter");
  await expect(editor).toBeFocused();
  await editor.press("Escape");

  await page.keyboard.press("ControlOrMeta+c");
  await page.keyboard.press("ControlOrMeta+v");
  await expect(
    page.locator(".harie-canvas-image text", { hasText: "通知を設定します" }),
  ).toHaveCount(2);
});

test("FR-EDIT-12: ? でショートカット一覧を開き、Ctrl / ⌘ + S で保存できる", async ({ page }) => {
  await open(page);
  await page.keyboard.press("Shift+?");
  const dialog = page.getByRole("dialog", { name: "キーボードショートカット" });
  await expect(dialog).toBeVisible();
  // Linux / Windows では Ctrl の表記
  await expect(dialog.getByRole("region", { name: "ファイル" })).toContainText("Ctrl+S");
  await expect(dialog.getByRole("region", { name: "編集" })).toContainText("Ctrl+Shift+Z");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // パレットのボタンからも開ける
  await page.getByRole("button", { name: "ショートカット一覧" }).first().click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "閉じる" }).click();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.keyboard.press("ControlOrMeta+s"),
  ]);
  expect(download.suggestedFilename()).toBe("large-base.harie.jpg");
});
