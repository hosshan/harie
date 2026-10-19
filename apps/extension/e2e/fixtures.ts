import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type BrowserContext,
  test as base,
  chromium,
  type Page,
  type Worker,
} from "@playwright/test";

const extensionPath = fileURLToPath(new URL("../.output-e2e/chrome-mv3", import.meta.url));

/** テスト用の SaaS 風ページ（架空の値だけを使う）。http://harie.test/ で返す */
export const PAGE_HTML = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>設定</title>
<style>body{margin:0;font:16px sans-serif}header{height:56px;background:#f2f4f7;padding:16px}
main{padding:24px}#save{position:absolute;left:40px;top:300px;width:160px;height:40px}</style></head>
<body><header><h1 style="margin:0;font-size:20px">通知設定</h1></header>
<main><label for="mail">メールアドレス</label>
<input id="mail" type="email" value="hanako.sato@example.com" style="width:300px">
<p>担当: 佐藤 花子</p></main>
<button id="save">変更を保存</button></body></html>`;

type Fixtures = { context: BrowserContext; worker: Worker; extensionId: string; target: Page };

export const test = base.extend<Fixtures>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright の書き方
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext(
      mkdtempSync(join(tmpdir(), "harie-ext-")),
      {
        ...(process.env.HARIE_CHROMIUM_PATH === undefined
          ? { channel: "chromium" }
          : { executablePath: process.env.HARIE_CHROMIUM_PATH }),
        headless: true,
        viewport: { width: 800, height: 600 },
        deviceScaleFactor: 1,
        acceptDownloads: true,
        // 画面の文言（日本語）で要素を探すので、表示言語を日本語にする
        locale: "ja-JP",
        args: [
          "--lang=ja",
          "--headless=new",
          `--disable-extensions-except=${extensionPath}`,
          `--load-extension=${extensionPath}`,
        ],
      },
    );
    await context.route("http://harie.test/**", (route) =>
      route.fulfill({ contentType: "text/html; charset=utf-8", body: PAGE_HTML }),
    );
    await use(context);
    await context.close();
  },
  worker: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
    await use(worker);
  },
  extensionId: async ({ worker }, use) => {
    await use(new URL(worker.url()).host);
  },
  target: async ({ context }, use) => {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto("http://harie.test/settings");
    await use(page);
  },
});

export const expect = test.expect;

/** background の入口を呼ぶ（ツールバーのボタンを押したのと同じ処理） */
export async function startCapture(
  worker: Worker,
  target: Page,
  mode: "visible" | "region" | "element",
): Promise<{ ok: boolean; message?: string }> {
  const url = target.url();
  return worker.evaluate(
    async ({ mode, url }) => {
      const [tab] = await chrome.tabs.query({ url });
      if (tab?.id === undefined) throw new Error("tab not found");
      await chrome.tabs.update(tab.id, { active: true });
      const start = (
        globalThis as unknown as {
          harieStart: (m: string, id: number) => Promise<{ ok: boolean; message?: string }>;
        }
      ).harieStart;
      return start(mode, tab.id);
    },
    { mode, url },
  );
}
