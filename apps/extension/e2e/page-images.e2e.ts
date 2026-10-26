import { readFileSync } from "node:fs";
import type { Worker } from "@playwright/test";
import { expect, test } from "./fixtures";

// ページ上の Harie 画像（FR-FILE-12, FR-FILE-13）。テスト用のビルドは全サイトの権限を持つので、ページ用のスクリプトが登録される
const guide = readFileSync(
  new URL("../../site/src/assets/tasklane-notifications.harie.png", import.meta.url),
);
const plain = readFileSync(new URL("../public/icon/128.png", import.meta.url));

async function waitPageScript(worker: Worker): Promise<void> {
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
  await waitPageScript(worker);
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
  const button = target.locator('[data-harie-page="edit"] button');

  // ファイル名が規則どおりの画像
  await target.locator("#named").hover();
  await expect(button).toBeVisible();
  await expect(button).toHaveAttribute("aria-label", "Harie で編集");

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

const rawUrl = "https://raw.githubusercontent.com/o/r/abc123/docs/guide.harie.png";

test("FR-FILE-12: GitHub のファイル表示で、注釈データを文字で表示してコピーできる", async ({
  context,
  worker,
  target,
}) => {
  await waitPageScript(worker);
  await context.route("https://github.com/o/r/**", (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("raw") === "true") {
      // 本物の GitHub は raw.githubusercontent.com へ転送する（テストのルーティングでは転送を再現しない）
      return route.fulfill({ contentType: "image/png", body: guide });
    }
    return route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `<!doctype html><html><body><div id="blob"><img alt="guide.harie.png" src="${url.pathname}?raw=true" style="max-width:100%"></div></body></html>`,
    });
  });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "https://github.com",
  });
  await target.goto("https://github.com/o/r/blob/main/docs/guide.harie.png");
  const panel = target.locator('[data-harie-page="annotations"]');
  await expect(panel).toHaveCount(1);
  await expect(panel.locator("pre").first()).toContainText("1. ");
  await expect(panel.locator("pre").first()).toHaveText(/^通知設定\n\n1\. .+\n2\. .+\n3\. .+$/);
  await panel.getByRole("button", { name: "JSON をコピー" }).click();
  await expect(panel.getByRole("button", { name: "コピーしました" })).toBeVisible();
  const copied = await target.evaluate(() => navigator.clipboard.readText());
  expect(JSON.parse(copied).docId).toBe("a8cbd35e-0a24-4f5d-98af-7b70abe7f96f");
});

test("FR-FILE-12: GitHub の差分（PR・コミット）の Harie 画像にも注釈データを出す", async ({
  context,
  worker,
  target,
}) => {
  await waitPageScript(worker);
  const enc = Buffer.from(rawUrl, "utf8").toString("hex");
  const other = Buffer.from("https://raw.githubusercontent.com/o/r/abc123/a.png").toString("hex");
  await context.route("https://github.com/o/r/**", (route) =>
    route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `<!doctype html><html><body>
<div class="file"><iframe src="https://viewscreen.githubusercontent.com/added/img?enc_url=${enc}&path=docs%2Fguide.harie.png" title="File display"></iframe></div>
<div class="file"><iframe src="https://viewscreen.githubusercontent.com/added/img?enc_url=${other}&path=a.png" title="File display"></iframe></div>
</body></html>`,
    }),
  );
  await context.route("https://viewscreen.githubusercontent.com/**", (route) =>
    route.fulfill({ contentType: "text/html", body: "<!doctype html><p>image</p>" }),
  );
  await context.route("https://raw.githubusercontent.com/**", (route) =>
    route.fulfill({ contentType: "image/png", body: guide }),
  );
  await target.goto("https://github.com/o/r/pull/1/files");
  const panel = target.locator('[data-harie-page="annotations"]');
  await expect(panel).toHaveCount(1);
  await expect(panel).toContainText("guide.harie.png");
  await expect(panel.locator("pre").first()).toContainText("3. ");
});
