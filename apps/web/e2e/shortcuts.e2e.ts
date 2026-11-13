import { readFileSync } from "node:fs";
import { expect, type FileChooser, type Page, test } from "@playwright/test";

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

test("FR-EDIT-12: 道具の切り替え・複製・矢印キーで動かす・大きさを変える・重なりの順・元に戻すをキーで行える", async ({
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

  // Ctrl / ⌘ + 矢印キーで枠の大きさを変える（左上は動かさない）
  const w = async () => Number(await first.getAttribute("width"));
  const w0 = await w();
  await page.keyboard.press("ControlOrMeta+Shift+ArrowRight");
  await expect.poll(w).toBe(w0 + 10);
  await page.keyboard.press("ControlOrMeta+ArrowLeft");
  await expect.poll(w).toBe(w0 + 9);
  expect(await x()).toBe(x0 + 1);
  await page.keyboard.press("ControlOrMeta+z");
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(w).toBe(w0);

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

test("FR-EDIT-12: 画像を開く前も Ctrl / ⌘ + O で開け、Ctrl / ⌘ + Shift + O で画像を差し替えられる", async ({
  page,
}) => {
  // ファイルを選ぶ画面（File System Access API）を差し替え、選ばれたことにする
  await page.addInitScript(
    (bytes: number[]) => {
      (window as unknown as Record<string, unknown>).showOpenFilePicker = async () => [
        {
          getFile: async () =>
            new File([new Uint8Array(bytes)], "large-base.jpg", { type: "image/jpeg" }),
        },
      ];
    },
    [...fixture],
  );
  await page.goto("/");
  await expect(
    page.getByRole("banner").getByRole("button", { name: "画像を開く" }),
  ).toHaveAttribute("title", "画像を開く（Ctrl+O）");
  await page.keyboard.press("ControlOrMeta+o");
  await expect(page.getByRole("application", { name: "注釈の編集面" })).toBeVisible();

  // 開いた後のファイル操作も、ボタンの title にショートカットを出す
  const header = page.getByRole("banner");
  await expect(header.getByRole("button", { name: "画像を差し替える" })).toHaveAttribute(
    "title",
    "画像を差し替える（Ctrl+Shift+O）",
  );
  // filechooser を待ち始めてからキーを押すと、ブラウザ側で横取りの設定が間に合わず
  // ファイル選択の画面が出ても拾えないことがある（CI で時々失敗した）。先に listener を付けて横取りを有効にしておく
  const chooserPromise = new Promise<FileChooser>((resolve) => page.once("filechooser", resolve));
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
  await page.keyboard.press("ControlOrMeta+Shift+O");
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: "new.jpg", mimeType: "image/jpeg", buffer: fixture });
  await expect(page.getByRole("status")).toContainText("画像を差し替えました");

  // 一覧にも載る
  await page.keyboard.press("Shift+?");
  const dialog = page.getByRole("dialog", { name: "キーボードショートカット" });
  await expect(dialog.getByRole("region", { name: "ファイル" })).toContainText("Ctrl+Shift+O");
});

test("FR-EDIT-12: 割り当てのない文字キーを押すと、パレットに道具の切り替えキーを少しのあいだ出す", async ({
  page,
}) => {
  await open(page);
  const palette = page.getByRole("toolbar", { name: "ツール" });
  const key = palette.locator(".harie-palette-key").first();
  await expect(key).toHaveCSS("opacity", "0");
  await page.keyboard.press("q");
  await expect(palette).toHaveAttribute("data-show-keys", "true");
  await expect(key).toHaveCSS("opacity", "1");
  // 割り当てのあるキーを押したら道具を切り替えて、表示を消す
  await page.keyboard.press("r");
  await expect(page.getByRole("button", { name: "四角" })).toHaveAttribute("aria-pressed", "true");
  await expect(palette).toHaveAttribute("data-show-keys", "false");
  // しばらくすると自然に消える
  await page.keyboard.press("q");
  await expect(palette).toHaveAttribute("data-show-keys", "true");
  await expect(palette).toHaveAttribute("data-show-keys", "false", { timeout: 4000 });
});
