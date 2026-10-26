import { readFileSync } from "node:fs";
import { readHarie } from "@harie/format";
import { annotationBounds } from "@harie/render";
import type { Worker } from "@playwright/test";
import { expect, test } from "./fixtures";

// ページ上の Harie 画像（FR-FILE-12, FR-FILE-13）。テスト用のビルドは全サイトの権限を持つので、ページ用のスクリプトが登録される
const guide = readFileSync(
  new URL("../../site/src/assets/tasklane-notifications.harie.png", import.meta.url),
);
const plain = readFileSync(new URL("../public/icon/128.png", import.meta.url));

/** ポップアップと同じ設定を保存し、ページ用のスクリプトが登録されるのを待つ */
async function enablePageButtons(
  worker: Worker,
  settings: { edit: boolean; copy: boolean; sites: string[] } = {
    edit: true,
    copy: true,
    sites: [],
  },
): Promise<void> {
  await worker.evaluate((v) => chrome.storage.local.set({ "harie.pageButtons": v }), settings);
  await expect
    .poll(() =>
      worker.evaluate(async () => {
        const scripts = await chrome.scripting.getRegisteredContentScripts();
        return scripts.map((s) => s.id);
      }),
    )
    .toContain("harie-page");
}

const editorOpened = (context: import("@playwright/test").BrowserContext, extensionId: string) =>
  context.waitForEvent("page", (p) =>
    p.url().startsWith(`chrome-extension://${extensionId}/editor.html`),
  );

test("FR-FILE-13: Harie 画像にカーソルを当てると編集ボタンが出て、押すとエディタで開ける", async ({
  context,
  worker,
  extensionId,
  target,
}) => {
  await enablePageButtons(worker);
  await context.route("http://harie.test/files/**", (route) =>
    route.fulfill({
      contentType: "image/png",
      body: route.request().url().endsWith("plain.png") ? plain : guide,
    }),
  );
  await context.route("http://harie.test/gallery", (route) =>
    route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `<!doctype html><html><body style="margin:0">
<img id="named" src="/files/guide.harie.png" style="display:block;width:320px;height:180px">
<img id="renamed" src="/files/guide.png" style="display:block;width:320px;height:180px">
<img id="plain" src="/files/plain.png" style="display:block;width:160px;height:160px">
</body></html>`,
    }),
  );
  await target.goto("http://harie.test/gallery");
  const button = target.locator('[data-harie-page] button[data-action="edit"]');

  // ファイル名が規則どおりの画像
  await target.locator("#named").hover();
  await expect(button).toBeVisible();
  await expect(button).toHaveAttribute("aria-label", "Harie で編集");
  // アイコンだけでは分かりにくいので、カーソルを当てるとツールチップを出す
  await expect(button.locator(".tip")).toBeHidden();
  await button.hover();
  await expect(button.locator(".tip")).toBeVisible();
  await expect(button.locator(".tip")).toHaveText("Harie で編集");

  // 規則どおりでないファイル名でも、埋め込みデータがあれば出す
  await target.locator("#plain").hover();
  await expect(button).toBeHidden();
  await target.locator("#renamed").hover();
  await expect(button).toBeVisible();

  // 普通の画像には出さない
  await target.locator("#plain").hover();
  await target.waitForTimeout(800);
  await expect(button).toBeHidden();

  await target.locator("#named").hover();
  const opened = editorOpened(context, extensionId);
  await button.click();
  const editor = await opened;
  await expect(editor.locator(".app-file-name")).toHaveText("guide.harie.png");
  await expect(editor.locator(".harie-canvas-overlay")).toHaveAttribute("viewBox", "0 0 1280 720");
  // 保存されていた注釈が、編集できる状態で戻る
  await expect(editor.locator(".harie-canvas-image svg text").first()).toBeAttached();
});

test("FR-FILE-12: 説明文の枠にカーソルを当てるとコピーボタンが出て、その説明文をコピーできる", async ({
  context,
  worker,
  target,
}) => {
  await enablePageButtons(worker);
  await context.route("https://github.com/o/r/**", (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("raw") === "true") {
      // 本物の GitHub は raw.githubusercontent.com へ転送する（テストのルーティングでは転送を再現しない）
      return route.fulfill({ contentType: "image/png", body: guide });
    }
    return route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `<!doctype html><html><body style="margin:0"><img alt="guide.harie.png" src="${url.pathname}?raw=true" style="display:block;width:640px;height:360px"></body></html>`,
    });
  });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "https://github.com",
  });
  await target.goto("https://github.com/o/r/blob/main/docs/guide.harie.png");
  // 見た目は変えない（カーソルを当てるまで何も出さない）
  const copyOne = target.locator('[data-harie-page] button[data-action="one"]');
  const copyAll = target.locator('[data-harie-page] button[data-action="all"]');
  await expect(copyAll).toBeHidden();

  const read = readHarie(new Uint8Array(guide));
  if (read.kind !== "harie") throw new Error(read.kind);
  const callout = read.doc.annotations.find((a) => a.type === "callout");
  if (callout?.type !== "callout") throw new Error("no callout");
  const b = annotationBounds(callout);
  const scale = 640 / read.doc.canvas.width;

  // 枠の外（画像の左上の隅）ではコピーボタンは出ない
  await target.mouse.move(20, 340);
  await expect(copyAll).toBeVisible();
  await expect(copyOne).toBeHidden();

  await target.mouse.move((b.x + b.w / 2) * scale, (b.y + b.h / 2) * scale);
  await expect(copyOne).toBeVisible();
  await copyOne.click();
  await expect(copyOne).toHaveAttribute("aria-label", "コピーしました");
  expect(await target.evaluate(() => navigator.clipboard.readText())).toBe(callout.text.trim());

  await copyAll.click();
  expect(await target.evaluate(() => navigator.clipboard.readText())).toMatch(
    /^通知設定\n\n1\. .+\n2\. .+\n3\. .+$/,
  );
});

test("FR-FILE-12, 13: ポップアップで出すボタンを選べる。オフにしたボタンは出さない", async ({
  context,
  worker,
  extensionId,
  target,
}) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  const edit = popup.getByLabel("画像に編集ボタンを表示");
  const copy = popup.getByLabel("画像に文章のコピーボタンを表示");
  await expect(edit).not.toBeChecked();
  await expect(copy).not.toBeChecked();
  await expect(popup.getByText("指定がなければ、すべてのサイトを対象にします。")).toBeVisible();
  // コピーボタンだけを出す（テスト用のビルドは全サイトの権限を持つので、確認は出ない）
  await copy.check();
  await expect(copy).toBeChecked();
  await expect
    .poll(() =>
      worker.evaluate(async () =>
        (await chrome.scripting.getRegisteredContentScripts()).map((s) => s.matches),
      ),
    )
    .toEqual([["<all_urls>"]]);
  // 開き直してもチェックは残る
  await popup.reload();
  await expect(copy).toBeChecked();
  await expect(edit).not.toBeChecked();

  // サイトを指定すると、そのサイト（とサブドメイン）だけに入れる
  const matches = () =>
    worker.evaluate(async () =>
      (await chrome.scripting.getRegisteredContentScripts()).map((s) =>
        [...(s.matches ?? [])].sort(),
      ),
    );
  await popup.getByLabel("追加するサイト").fill("not a domain");
  await popup.getByRole("button", { name: "追加" }).click();
  await expect(popup.getByRole("status")).toHaveText(
    "ドメインの形で入れてください（例: github.com）",
  );
  await popup.getByLabel("追加するサイト").fill("https://GitHub.com/o/r/pull/1");
  await popup.getByRole("button", { name: "追加" }).click();
  await expect(popup.getByRole("listitem")).toHaveText(["github.com×"]);
  await expect
    .poll(matches)
    .toEqual([["*://*.github.com/*", "*://github.com/*", "https://*.githubusercontent.com/*"]]);
  await popup.getByLabel("追加するサイト").fill("harie.test");
  await popup.getByLabel("追加するサイト").press("Enter");
  await expect(popup.getByRole("listitem")).toHaveCount(2);
  // 外すと、そのサイトでは出さない。全部外せばすべてのサイト
  await popup.getByRole("button", { name: "github.com を外す" }).click();
  await expect.poll(matches).toEqual([["*://*.harie.test/*", "*://harie.test/*"]]);
  await popup.close();

  await context.route("http://harie.test/files/**", (route) =>
    route.fulfill({ contentType: "image/png", body: guide }),
  );
  await context.route("http://harie.test/one", (route) =>
    route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `<!doctype html><html><body style="margin:0"><img id="named" src="/files/guide.harie.png" style="display:block;width:640px;height:360px"></body></html>`,
    }),
  );
  await target.goto("http://harie.test/one");
  await target.locator("#named").hover();
  await expect(target.locator('[data-harie-page] button[data-action="all"]')).toBeVisible();
  await expect(target.locator('[data-harie-page] button[data-action="edit"]')).toBeHidden();
});
