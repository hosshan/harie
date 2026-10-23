// SNS 共有用の画像（OGP、1200×630）を作る。`pnpm --filter @harie/site og` で動かす。
// テイストは Chrome ウェブストアのプロモーション タイル（apps/extension/scripts/store-assets.mjs）に合わせる。
// 文字は Google Fonts の Noto Sans JP を使うので、ネットにつながる環境で動かす
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const assets = fileURLToPath(new URL("../src/assets", import.meta.url));
const symbol = readFileSync(join(assets, "harie-symbol.svg"), "utf8");

const LOCALES = [
  {
    lang: "ja",
    out: "og.png",
    demo: "demo-annotated.webp",
    tagline: ["ただの画像なのに、", "何度でも直せる。"],
  },
  {
    lang: "en",
    out: "og.en.png",
    demo: "demo-annotated.en.webp",
    tagline: ["Just an image.", "Editable anytime."],
  },
];

const browser = await chromium.launch(
  process.env.HARIE_CHROMIUM_PATH === undefined
    ? { channel: "chromium" }
    : { executablePath: process.env.HARIE_CHROMIUM_PATH },
);
for (const l of LOCALES) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  const demo = readFileSync(join(assets, l.demo)).toString("base64");
  await page.setContent(`<!doctype html><html lang="${l.lang}"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700;900&display=block">
<style>
body{margin:0;width:1200px;height:630px;background:#fbf6e9;position:relative;overflow:hidden;
font-family:"Noto Sans JP",sans-serif;color:#2b2620}
.dot{position:absolute;left:560px;top:-130px;width:300px;height:300px;border-radius:50%;background:#d4a72c;opacity:.35}
.sq{position:absolute;right:-90px;bottom:-150px;width:520px;height:440px;background:#ebd08a;transform:rotate(-8deg);border-radius:20px}
.copy{position:absolute;left:80px;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center}
.logo{display:flex;align-items:center;gap:22px;font-size:84px;font-weight:900;letter-spacing:-0.01em}
.logo svg{width:100px;height:100px}
p{margin:30px 0 0;font-size:46px;font-weight:700;line-height:1.5}
.url{position:absolute;left:80px;bottom:48px;font-size:22px;font-weight:700;color:#86650f}
.shot{position:absolute;right:64px;top:150px;width:520px;padding:10px;background:#fff;border-radius:8px;transform:rotate(2deg);
box-shadow:0 1px 0 #e7dcc3,0 28px 56px -24px rgb(80 60 20 / .5)}
.shot img{display:block;width:100%;border-radius:3px}
</style></head><body><div class="dot"></div><div class="sq"></div>
<div class="copy"><div class="logo">${symbol}Harie</div><p>${l.tagline.join("<br>")}</p></div>
<div class="shot"><img src="data:image/webp;base64,${demo}" alt=""></div>
<div class="url">harie.studio</div></body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(assets, l.out) });
  await page.close();
}
await browser.close();
console.log(`${assets} に og.png と og.en.png を書き出しました`);
