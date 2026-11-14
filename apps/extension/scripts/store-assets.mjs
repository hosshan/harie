// Chrome ウェブストアの掲載用の画像を撮る（STORE.md）。`pnpm --filter @harie/extension store-assets` で動かす。
// テスト用ビルド（.output-e2e。ボタンを押さずに撮れるよう全サイトの権限付き）を Chromium に読み込み、
// 架空の SaaS「Tasklane」の見本で撮る。撮った画面に見出しを付けて、store-assets/ に
// 1280×800 のスクリーンショット 5 枚、440×280 のタイル（小）、1400×560 のマーキー タイルを書き出す
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
const FONT = `"Noto Sans CJK JP","Noto Sans JP","Hiragino Sans",sans-serif`;
const symbol = readFileSync(join(repo, "apps/site/src/assets/harie-symbol.svg"), "utf8");

const pageEn = readFileSync(join(repo, "apps/site/demo/notifications.en.html"), "utf8");
// 日本語の見本ページ。英語版の文言を置き換えて作る（DOM があるので、個人情報をページの文字から探せる）
const pageJa = [
  ['lang="en"', 'lang="ja"'],
  ["Notifications - Tasklane", "通知設定 - Tasklane"],
  ['"Noto Sans", "DejaVu Sans"', '"Noto Sans CJK JP", "Noto Sans JP"'],
  [
    "<span>Dashboard</span><span>Projects</span><span>Reports</span>",
    "<span>ダッシュボード</span><span>プロジェクト</span><span>レポート</span>",
  ],
  [
    '<div class="avatar">AJ</div><div>Alex Johnson<small>alex.johnson@example.com</small>',
    '<div class="avatar">山</div><div>山田 太郎<small>taro.yamada@example.com</small>',
  ],
  [">Profile<", ">プロフィール<"],
  [">Team<", ">チーム<"],
  ['active">Notifications<', 'active">通知<'],
  [">Billing<", ">請求<"],
  [">Security<", ">セキュリティ<"],
  ["<h1>Notifications</h1>", "<h1>通知設定</h1>"],
  ["Choose where task updates are sent.", "タスクの更新をどこに通知するかを設定します。"],
  [">Email<", ">メール<"],
  [">In-app<", ">アプリ内<"],
  [">Integrations<", ">外部サービス連携<"],
  [
    "<b>Notify in Slack</b><span>Send new tasks, completions and comments to Slack</span>",
    "<b>Slack に通知する</b><span>タスクの作成・完了・コメントを Slack に送ります</span>",
  ],
  [
    "<b>Channel</b><span>The Slack channel that receives notifications</span>",
    "<b>通知先チャンネル</b><span>通知を送る Slack のチャンネル</span>",
  ],
  ["<option>Select a channel</option>", "<option>チャンネルを選択</option>"],
  [
    "<b>Notify in Microsoft Teams</b><span>Send to a Teams channel</span>",
    "<b>Microsoft Teams に通知する</b><span>Teams のチャネルに送ります</span>",
  ],
  [
    "<b>Owner: Maria Garcia</b><span>maria.garcia@example.com · Updated Oct 1, 2026</span>",
    "<b>担当者: 佐藤 花子</b><span>hanako.sato@example.com · 最終更新 2026/10/01</span>",
  ],
  [">Change<", ">変更<"],
  [">Cancel<", ">キャンセル<"],
  ['data-gt="save">Save<', 'data-gt="save">保存<'],
].reduce((html, [from, to]) => {
  if (!html.includes(from)) throw new Error(`見本ページに「${from}」がない`);
  return html.replace(from, to);
}, pageEn);

const LOCALES = {
  ja: {
    suffix: "",
    page: pageJa,
    sample: join(repo, "apps/site/src/assets/tasklane-notifications.harie.png"),
    tagline: ["ただの画像なのに、", "何度でも直せる。"],
    lead: "スクリーンショットに枠・番号・説明を付ける Chrome 拡張",
    captions: [
      "表示中のページを、ボタンひとつで撮る",
      "範囲や要素を選んで、必要なところだけ撮る",
      "枠・番号・吹き出しを付けて、保存後も何度でも直せる",
      "メールアドレスなどの個人情報は、ダミーの文字やモザイクで隠す",
      "Web に載せた Harie 画像から、説明文をそのままコピー",
    ],
    labels: {
      mask: "個人情報を隠す",
      findPii: "ページの文字から探す",
      applyMask: "マスクを適用する",
      finish: ["影", "角丸"],
      help: {
        title: "Slack 通知の設定 - Tasklane ヘルプセンター",
        brand: "Tasklane ヘルプセンター",
        h1: "Slack に通知を送る",
        lead: "タスクの作成や完了を Slack のチャンネルに通知できます。次の手順で設定してください。",
        caption: "設定 ＞ 通知 ＞ 外部サービス連携",
      },
    },
  },
  en: {
    suffix: ".en",
    page: pageEn,
    sample: join(repo, "apps/site/src/assets/tasklane-notifications.en.harie.png"),
    tagline: ["Just an image.", "Editable anytime."],
    lead: "A Chrome extension that adds boxes, numbers and notes to screenshots",
    captions: [
      "Capture the page you're viewing in one click",
      "Pick a region or an element to capture just what you need",
      "Add boxes, numbers and callouts, and edit them again anytime",
      "Hide emails and other personal info with dummy text or blur",
      "Copy the notes straight from Harie images on the web",
    ],
    labels: {
      mask: "Hide personal info",
      findPii: "Search the page text",
      applyMask: "Apply masks",
      finish: ["Shadow", "Rounded"],
      help: {
        title: "Set up Slack notifications - Tasklane Help Center",
        brand: "Tasklane Help Center",
        h1: "Send notifications to Slack",
        lead: "Tasklane can post new and completed tasks to a Slack channel. Follow these steps to set it up.",
        caption: "Settings > Notifications > Integrations",
      },
    },
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
  return { context, worker, extensionId: new URL(worker.url()).host };
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

/** 撮った画面（1280×800）を縮めて、上に見出しを付けた 1280×800 の掲載画像にする */
async function compose(context, shot, caption, path, extra = "") {
  const page = await context.newPage();
  await page.setViewportSize(VIEWPORT);
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;width:1280px;height:800px;background:#fbf6e9;font-family:${FONT};color:#2b2620;position:relative;overflow:hidden}
.sq{position:absolute;left:-60px;top:-70px;width:200px;height:200px;background:#ebd08a;transform:rotate(-8deg);border-radius:14px}
.dot{position:absolute;right:-60px;top:-90px;width:220px;height:220px;border-radius:50%;background:#d4a72c;opacity:.3}
h1{position:relative;margin:0;padding-top:40px;text-align:center;font-size:36px;font-weight:800;letter-spacing:.02em}
img{position:absolute;left:128px;top:128px;width:1024px;height:640px;border-radius:12px;
box-shadow:0 18px 48px rgb(60 45 10 / .22),0 0 0 1px rgb(60 45 10 / .12)}
</style></head><body><div class="sq"></div><div class="dot"></div><h1>${caption}</h1>
<img src="data:image/png;base64,${shot.toString("base64")}">${extra}</body></html>`);
  for (const img of await page.locator("img").all()) await img.evaluate((i) => i.decode());
  await page.screenshot({ path });
  await page.close();
}

/** 撮った画像の代わりに Harie ファイルを渡して、拡張のエディタを開き直す */
async function openInEditor(editor, bytes, fileName) {
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
    { bytes: bytes.toString("base64"), fileName },
  );
  await editor.reload();
  await editor.waitForLoadState("networkidle");
  await editor.waitForTimeout(1500);
}

async function shoot(lang) {
  const l = LOCALES[lang];
  const { context, worker, extensionId } = await launch(lang);
  const sample = readFileSync(l.sample);
  await context.route("http://tasklane.test/**", (route) =>
    route.fulfill({ contentType: "text/html; charset=utf-8", body: l.page }),
  );
  const target = context.pages()[0] ?? (await context.newPage());
  const url = "http://tasklane.test/settings/notifications";
  await target.goto(url);
  const file = (n, name) => join(out, `screenshot-${n}-${name}${l.suffix}.png`);

  // 拡張の言語はエディタの設定（拡張ページの localStorage）に合わせる
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.evaluate((lang) => localStorage.setItem("harie.locale", lang), lang);
  await popup.reload();
  await popup.setViewportSize({ width: 320, height: 300 });
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
  await compose(context, await target.screenshot(), l.captions[0], file(1, "capture"));
  await target.evaluate(() => document.getElementById("harie-popup-shot")?.remove());

  // 2. 範囲を選んで撮る（ドラッグの途中）
  await startCapture(popup, url, "region", lang);
  await target.waitForSelector("[data-harie-overlay]");
  await target.mouse.move(250, 140);
  await target.mouse.down();
  await target.mouse.move(1012, 430, { steps: 8 });
  await compose(context, await target.screenshot(), l.captions[1], file(2, "region"));
  await target.keyboard.press("Escape");
  await target.mouse.up();

  // 3. エディタで注釈を付けた状態。見本の Harie ファイルで開き直し、画像の仕上げと吹き出しを選ぶ
  let opened = context.waitForEvent("page", (p) => p.url().includes("editor.html"));
  await startCapture(popup, url, "visible", lang);
  const editor = await opened;
  await editor.setViewportSize(VIEWPORT);
  await editor.waitForLoadState("networkidle");
  await openInEditor(editor, sample, "tasklane-notifications.harie.png");
  // 画像の仕上げは影と角丸を組み合わせる
  for (const name of l.labels.finish) {
    await editor.getByRole("button", { name, exact: true }).click();
  }
  await editor.waitForTimeout(500);
  await compose(context, await editor.screenshot(), l.captions[2], file(3, "editor"));

  // 4. 個人情報を隠す。撮ったばかりの画面で、ページの文字から候補を探してダミーの文字に置き換える（AI は使わない）
  opened = context.waitForEvent("page", (p) => p.url().includes("editor.html"));
  await startCapture(popup, url, "visible", lang);
  const masking = await opened;
  await masking.setViewportSize(VIEWPORT);
  await masking.waitForLoadState("networkidle");
  await masking.getByRole("button", { name: l.labels.mask, exact: true }).click();
  await masking.getByRole("button", { name: l.labels.findPii }).click();
  await masking.getByRole("button", { name: l.labels.applyMask }).click();
  // 確認の欄の「適用する」（右側のボタン）
  await masking.getByRole("alertdialog").getByRole("button").last().click();
  await masking.waitForTimeout(1500);
  // 画面では小さくて読めないので、置き換えた行（担当者の欄）を原寸で切り出して、拡大図として重ねる
  const owner = await target.locator('[data-gt="owner-pii"]').boundingBox();
  const zoom = await masking.evaluate(
    async (r) => {
      const href = document.querySelector(".harie-canvas-image svg image")?.getAttribute("href");
      const img = new Image();
      img.src = href;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = r.width;
      c.height = r.height;
      c.getContext("2d").drawImage(img, r.x, r.y, r.width, r.height, 0, 0, r.width, r.height);
      return c.toDataURL("image/png");
    },
    {
      x: Math.round(owner.x) - 16,
      y: Math.round(owner.y) - 12,
      width: 340,
      height: Math.round(owner.height) + 24,
    },
  );
  // 適用直後の案内は、ファイル名の欄を狭めるので写さない
  await masking.locator(".app-header-status").evaluate((el) => el.remove());
  await compose(
    context,
    await masking.screenshot(),
    l.captions[3],
    file(4, "mask"),
    `<img src="${zoom}" style="left:auto;top:auto;right:88px;bottom:48px;width:510px;height:auto;border-radius:10px;border:3px solid #d4a72c">`,
  );

  // 5. Web に載せた Harie 画像（ヘルプセンターの記事）。説明文の枠にカーソルを当てるとコピーボタンが出る
  await worker.evaluate(() =>
    chrome.storage.local.set({ "harie.pageButtons": { edit: true, copy: true, sites: [] } }),
  );
  for (let i = 0; i < 50; i += 1) {
    const ids = await worker.evaluate(async () =>
      (await chrome.scripting.getRegisteredContentScripts()).map((s) => s.id),
    );
    if (ids.includes("harie-page")) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  const h = l.labels.help;
  await context.route("http://help.tasklane.test/**", (route) =>
    route.request().url().endsWith(".png")
      ? route.fulfill({ contentType: "image/png", body: sample })
      : route.fulfill({
          contentType: "text/html; charset=utf-8",
          body: `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${h.title}</title><style>
body{margin:0;font-family:${FONT};color:#1f2937;background:#fff}
header{height:56px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;padding:0 32px;font-weight:700;color:#4f46e5;font-size:17px}
main{max-width:960px;margin:0 auto;padding:28px 32px}
h1{font-size:26px;margin:0 0 8px}p{color:#4b5563;margin:0 0 20px;line-height:1.7}
figure{margin:0}img{display:block;width:896px;height:504px;border:1px solid #e5e7eb;border-radius:8px}
figcaption{color:#6b7280;font-size:13px;margin-top:8px}
</style></head><body><header>${h.brand}</header><main><h1>${h.h1}</h1><p>${h.lead}</p>
<figure><img src="/img/slack-notifications.harie.png" alt=""><figcaption>${h.caption}</figcaption></figure></main></body></html>`,
        }),
  );
  const help = await context.newPage();
  await help.setViewportSize(VIEWPORT);
  await help.goto("http://help.tasklane.test/articles/slack");
  await help.waitForLoadState("networkidle");
  const img = await help.locator("img").boundingBox();
  // 見本の 1 番目の吹き出し（「Slack に通知する」をオン）の中ほど。画像は 1280×720 を 896×504 で表示している
  const k = img.width / 1280;
  await help.mouse.move(img.x + 600 * k, img.y + 400 * k);
  await help.mouse.move(img.x + 1144 * k, img.y + 231 * k, { steps: 5 });
  await help.locator('[data-harie-page] button[data-action="one"]').waitFor();
  await help.locator('[data-harie-page] button[data-action="one"]').hover();
  await help.waitForTimeout(400);
  await compose(context, await help.screenshot(), l.captions[4], file(5, "page"));

  // プロモーション タイル（小、440×280）
  const tile = await context.newPage();
  await tile.setViewportSize({ width: 440, height: 280 });
  await tile.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;width:440px;height:280px;background:#fbf6e9;display:flex;flex-direction:column;justify-content:center;padding:0 40px;box-sizing:border-box;
font-family:${FONT};color:#2b2620;position:relative;overflow:hidden}
.sq{position:absolute;right:-30px;bottom:-40px;width:170px;height:170px;background:#ebd08a;transform:rotate(-8deg);border-radius:10px}
.dot{position:absolute;right:90px;top:-50px;width:120px;height:120px;border-radius:50%;background:#d4a72c;opacity:.35}
.logo{display:flex;align-items:center;gap:12px;font-size:40px;font-weight:900;position:relative}
.logo svg{width:52px;height:52px}
p{margin:18px 0 0;font-size:22px;font-weight:700;line-height:1.45;position:relative}
</style></head><body><div class="sq"></div><div class="dot"></div>
<div class="logo">${symbol}Harie</div><p>${l.tagline.join("<br>")}</p></body></html>`);
  await tile.screenshot({ path: join(out, `promo-small${l.suffix}.png`) });

  // マーキー タイル（1400×560）。左にロゴと見出し、右に注釈を付けた見本の画像
  await tile.setViewportSize({ width: 1400, height: 560 });
  await tile.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;width:1400px;height:560px;background:#fbf6e9;font-family:${FONT};color:#2b2620;position:relative;overflow:hidden}
.sq{position:absolute;left:-70px;bottom:-90px;width:260px;height:260px;background:#ebd08a;transform:rotate(-8deg);border-radius:16px}
.dot{position:absolute;left:420px;top:-90px;width:220px;height:220px;border-radius:50%;background:#d4a72c;opacity:.3}
.text{position:absolute;left:80px;top:0;bottom:0;width:470px;display:flex;flex-direction:column;justify-content:center}
.logo{display:flex;align-items:center;gap:16px;font-size:52px;font-weight:900}
.logo svg{width:68px;height:68px}
h1{margin:28px 0 0;font-size:38px;font-weight:800;line-height:1.4}
p{margin:18px 0 0;font-size:19px;line-height:1.6;color:#5c5246}
img{position:absolute;left:600px;top:70px;width:747px;height:420px;border-radius:12px;
box-shadow:0 22px 56px rgb(60 45 10 / .25),0 0 0 1px rgb(60 45 10 / .12)}
</style></head><body><div class="sq"></div><div class="dot"></div>
<div class="text"><div class="logo">${symbol}Harie</div><h1>${l.tagline.join("<br>")}</h1><p>${l.lead}</p></div>
<img src="data:image/png;base64,${sample.toString("base64")}"></body></html>`);
  await tile.locator("img").evaluate((img) => img.decode());
  await tile.screenshot({ path: join(out, `promo-marquee${l.suffix}.png`) });

  await context.close();
}

await mkdir(out, { recursive: true });
for (const lang of Object.keys(LOCALES)) await shoot(lang);
console.log(`${out} に書き出しました`);
