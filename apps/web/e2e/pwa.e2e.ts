// インストールした Web アプリ（PWA）としての入口（FR-FILE-14, FR-CAP-09, NFR-PLAT-06）
import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";

const FIXTURES = new URL("../../../packages/format/fixtures/", import.meta.url);
const fixture = (name: string) => readFileSync(new URL(name, FIXTURES));

const canvas = (page: Page) => page.getByRole("application", { name: "注釈の編集面" });

test("NFR-PLAT-06: manifest に ID・ファイルの関連付け・共有の受け取り先がある", async ({
  request,
}) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({
    name: "Harie",
    id: ".",
    start_url: ".",
    display: "standalone",
    file_handlers: [
      { action: ".", accept: { "image/jpeg": [".jpg", ".jpeg"], "image/png": [".png"] } },
    ],
    share_target: { action: "share-target", method: "POST", enctype: "multipart/form-data" },
  });
});

test("FR-FILE-14: OS の「このアプリで開く」から渡された画像を開く", async ({ page }) => {
  const bytes = [...fixture("large-base.jpg")];
  // launchQueue（File Handling API）の代わり。アプリが登録した受け取り口に、ファイルのハンドルを渡す
  await page.addInitScript((data) => {
    const file = new File([new Uint8Array(data)], "launched.jpg", { type: "image/jpeg" });
    const handle = { kind: "file", name: file.name, getFile: async () => file };
    // Chromium には本物の launchQueue があるので、プロパティごと差し替える
    Object.defineProperty(window, "launchQueue", {
      configurable: true,
      value: {
        setConsumer: (consumer: (p: { files: unknown[] }) => void) =>
          setTimeout(() => consumer({ files: [handle] }), 0),
      },
    });
  }, bytes);
  await page.goto("/");
  await expect(canvas(page)).toBeVisible();
  await expect(page.locator(".app-file-name")).toHaveText("launched.jpg");
});

test("FR-CAP-09: 共有メニューから送られた画像を Service Worker が受け取り、エディタで開く", async ({
  page,
}) => {
  await page.goto("/");
  // Service Worker がページを受け持つまで待つ（初回は読み込み直す）
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);

  // 共有メニュー（share_target）は、manifest の受け取り先に multipart の POST を送る
  const redirected = await page.evaluate(
    async (data) => {
      const form = new FormData();
      form.append("image", new File([new Uint8Array(data)], "shared.png", { type: "image/png" }));
      const res = await fetch("share-target", { method: "POST", body: form });
      return new URL(res.url).search;
    },
    [...fixture("base.png")],
  );
  expect(redirected).toBe("?shared=");

  await page.goto("/?shared=");
  await expect(canvas(page)).toBeVisible();
  await expect(page.locator(".app-file-name")).toHaveText("shared.png");
  // 開いたら URL から印を外し、預けた画像も消す（読み込み直しても開き直さない）
  expect(new URL(page.url()).search).toBe("");
  await page.reload();
  await expect(canvas(page)).toHaveCount(0);
});

test("NFR-PLAT-06: ブラウザがインストールを勧められるときは「連携」からインストールできる", async ({
  page,
}) => {
  await page.goto("/");
  // Chrome が出す beforeinstallprompt の代わり
  await page.evaluate(() => {
    const e = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(e, {
      prompt: async () => {
        Object.assign(window, { harieInstallPrompted: true });
      },
      userChoice: Promise.resolve({ outcome: "accepted" }),
    });
    window.dispatchEvent(e);
  });
  await page.getByRole("button", { name: "連携" }).click();
  const app = page.getByRole("region", { name: "アプリ" });
  await app.getByRole("button", { name: "アプリとしてインストール" }).click();
  await expect.poll(() => page.evaluate(() => "harieInstallPrompted" in window)).toBe(true);
  // 一度出した案内は使い回せないので、ブラウザのメニューからの入れ方に戻す
  await expect(app.getByRole("button", { name: "アプリとしてインストール" })).toHaveCount(0);
  await expect(app).toContainText("アプリをインストール");
});
