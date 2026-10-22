// Chrome ウェブストアの掲載用の画像を撮る（STORE.md）。`pnpm --filter @harie/extension store-assets` で動かす。
// テスト用ビルド（.output-e2e。ボタンを押さずに撮れるよう全サイトの権限付き）を Chromium に読み込み、
// 架空の SaaS「Tasklane」の見本で撮る。出力は store-assets/（1280×800 のスクリーンショットと 440×280 のタイル）
import { mkdtempSync, readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = fileURLToPath(new URL("..", import.meta.url));
const repo = join(root, "../..");
const extensionPath = join(root, ".output-e2e/chrome-mv3");
const out = join(root, "store-assets");
const VIEWPORT = { width: 1280, height: 800 };

const LOCALES = {
  ja: {
    suffix: "",
    // 日本語の見本は画像しかないので、その画像を等倍で表示するページにする
    page: `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>通知設定 - Tasklane</title>
<style>body{margin:0;background:#f3f4f6}img{display:block}</style></head>
<body><img src="data:image/png;base64,${readFileSync(join(repo, "apps/mcp/eval/fixtures/notifications.png")).toString("base64")}" width="1280" height="720"></body></html>`,
    sample: join(repo, "apps/site/src/assets/tasklane-notifications.harie.png"),
    tagline: ["ただの画像なのに、", "何度でも直せる。"],
  },
  en: {
    suffix: ".en",
    page: readFileSync(join(repo, "apps/site/demo/notifications.en.html"), "utf8"),
    sample: join(repo, "apps/site/src/assets/tasklane-notifications.en.harie.png"),
    tagline: ["Just an image.", "Editable anytime."],
  },
};

async function launch(lang) {
  const context = await chromium.launchPersistentContext(
    mkdtempSync(join(tmpdir(), "harie-store-")),
    {
      ...(process.env.HARIE_CHROMIUM_PATH === undefined
        ? { channel: "chromium" }
        : { executablePath: process.env.HARIE_CHROMIUM_PATH }),
      headless: true,
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      locale: lang === "ja" ? "ja-JP" : "en-US",
      args: [
        `--lang=${lang}`,
        "--headless=new",
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    },
  );
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  return { context, extensionId: new URL(worker.url()).host };
}

/** ポップアップのボタンと同じ指示を、拡張のページから background に送る */
function startCapture(control, url, mode, locale) {
  return control.evaluate(
    async ({ url, mode, locale }) => {
      const [tab] = await chrome.tabs.query({ url });
      await chrome.tabs.update(tab.id, { active: true });
      return chrome.runtime.sendMessage({ type: "harie:start", mode, tabId: tab.id, locale });
    },
    { url, mode, locale },
  );
}

async function shoot(lang) {
  const l = LOCALES[lang];
  const { context, extensionId } = await launch(lang);
  await context.route("http://tasklane.test/**", (route) =>
    route.fulfill({ contentType: "text/html; charset=utf-8", body: l.page }),
  );
  const target = context.pages()[0] ?? (await context.newPage());
  const url = "http://tasklane.test/settings/notifications";
  await target.goto(url);

  // 拡張の言語はエディタの設定（拡張ページの localStorage）に合わせる
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.evaluate((lang) => localStorage.setItem("harie.locale", lang), lang);
  await popup.reload();
  await popup.setViewportSize({ width: 320, height: 400 });
  const popupPng = await popup.locator("body").screenshot();

  // 1. ツールバーのボタンで開くメニュー（ポップアップを撮って、ページの右上に重ねる）
  await target.bringToFront();
  await target.evaluate(
    (src) => {
      const img = document.createElement("img");
      img.id = "harie-popup-shot";
      img.src = src;
      img.style.cssText =
        "position:fixed;top:8px;right:16px;z-index:2147483647;border-radius:8px;box-shadow:0 12px 32px rgb(0 0 0 / 0.28),0 0 0 1px rgb(0 0 0 / 0.08)";
      document.body.append(img);
      return img.decode();
    },
    `data:image/png;base64,${popupPng.toString("base64")}`,
  );
  await target.screenshot({ path: join(out, `screenshot-1-capture${l.suffix}.png`) });
  await target.evaluate(() => document.getElementById("harie-popup-shot")?.remove());

  // 2. 範囲を選んで撮る（ドラッグの途中）
  await startCapture(popup, url, "region", lang);
  await target.waitForSelector("[data-harie-overlay]");
  await target.mouse.move(250, 150);
  await target.mouse.down();
  await target.mouse.move(1010, 560, { steps: 8 });
  await target.screenshot({ path: join(out, `screenshot-2-region${l.suffix}.png`) });
  await target.keyboard.press("Escape");

  // 3. エディタで注釈を付けた状態。撮った画像の代わりに見本の Harie ファイルを渡して開き直す
  // （拡張のエディタは IndexedDB に置いたキャプチャを、Harie ファイルとして読み込む）
  const editorOpened = context.waitForEvent("page", (p) => p.url().includes("editor.html"));
  await startCapture(popup, url, "visible", lang);
  const editor = await editorOpened;
  await editor.setViewportSize(VIEWPORT);
  await editor.waitForLoadState("networkidle");
  await editor.evaluate(
    async ({ bytes, fileName }) => {
      const id = decodeURIComponent(location.hash.slice(1));
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open("harie", 1);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const store = db.transaction("captures", "readwrite").objectStore("captures");
      const record = await new Promise((resolve) => {
        store.get(id).onsuccess = (e) => resolve(e.target.result);
      });
      const image = new Blob([Uint8Array.from(atob(bytes), (c) => c.charCodeAt(0))], {
        type: "image/png",
      });
      await new Promise((resolve) => {
        store.put({ ...record, fileName, image }).onsuccess = resolve;
      });
      db.close();
    },
    {
      bytes: readFileSync(l.sample).toString("base64"),
      fileName: "tasklane-notifications.harie.png",
    },
  );
  await editor.reload();
  await editor.waitForLoadState("networkidle");
  await editor.waitForTimeout(1500);
  await editor.screenshot({ path: join(out, `screenshot-3-editor${l.suffix}.png`) });

  // プロモーション タイル（小、440×280）
  const tile = await context.newPage();
  await tile.setViewportSize({ width: 440, height: 280 });
  const symbol = readFileSync(join(repo, "apps/site/src/assets/harie-symbol.svg"), "utf8");
  await tile.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;width:440px;height:280px;background:#fbf6e9;display:flex;flex-direction:column;justify-content:center;padding:0 40px;box-sizing:border-box;
font-family:"Noto Sans CJK JP","Noto Sans JP","Hiragino Sans",sans-serif;color:#2b2620;position:relative;overflow:hidden}
.sq{position:absolute;right:-30px;bottom:-40px;width:170px;height:170px;background:#ebd08a;transform:rotate(-8deg);border-radius:10px}
.dot{position:absolute;right:90px;top:-50px;width:120px;height:120px;border-radius:50%;background:#d4a72c;opacity:.35}
.logo{display:flex;align-items:center;gap:12px;font-size:40px;font-weight:900;position:relative}
.logo svg{width:52px;height:52px}
p{margin:18px 0 0;font-size:22px;font-weight:700;line-height:1.45;position:relative}
</style></head><body><div class="sq"></div><div class="dot"></div>
<div class="logo">${symbol}Harie</div><p>${l.tagline.join("<br>")}</p></body></html>`);
  await tile.screenshot({ path: join(out, `promo-small${l.suffix}.png`) });

  await context.close();
}

await mkdir(out, { recursive: true });
for (const lang of Object.keys(LOCALES)) await shoot(lang);
console.log(`${out} に書き出しました`);
