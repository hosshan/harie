// LP の検索・AI 向けの情報が本文とずれていないかを確かめる。build.mjs から呼ぶ。
// - 構造化データ（JSON-LD）が読めること
// - FAQPage の質問と答えが、ページに見えている「よくある質問」と同じ文であること
// - canonical があり、og:url と同じであること
// - sitemap.xml の URL が src/ のページを指していること（/app/ はエディタなので除く）
import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const src = fileURLToPath(new URL("../src/", import.meta.url));
const origin = "https://harie.studio/";

const decode = (s) =>
  s
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

const errors = [];

for (const page of ["index.html", "en/index.html"]) {
  const html = await readFile(`${src}${page}`, "utf8");
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  let faq;
  for (const [, json] of blocks) {
    try {
      const data = JSON.parse(json);
      faq ??= (data["@graph"] ?? [data]).find((node) => node["@type"] === "FAQPage");
    } catch (error) {
      errors.push(`${page}: JSON-LD が読めません（${error.message}）`);
    }
  }
  const section = html.match(/<section[^>]*id="faq"[\s\S]*?<\/section>/)?.[0] ?? "";
  const visible = [...section.matchAll(/<h3>([\s\S]*?)<\/h3>\s*<p>([\s\S]*?)<\/p>/g)].map(
    ([, q, a]) => [decode(q), decode(a)],
  );
  const structured = (faq?.mainEntity ?? []).map((item) => [item.name, item.acceptedAnswer?.text]);
  if (visible.length === 0) errors.push(`${page}: よくある質問の節が見つかりません`);
  if (JSON.stringify(visible) !== JSON.stringify(structured)) {
    errors.push(`${page}: FAQPage の JSON-LD と、ページのよくある質問の文が一致しません`);
  }

  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
  const ogUrl = html.match(/<meta property="og:url" content="([^"]+)"/)?.[1];
  if (!canonical || canonical !== ogUrl) {
    errors.push(`${page}: canonical（${canonical}）と og:url（${ogUrl}）がそろっていません`);
  }
}

const sitemap = await readFile(`${src}sitemap.xml`, "utf8");
for (const [, url] of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) {
  if (!url.startsWith(origin)) {
    errors.push(`sitemap.xml: ${url} は ${origin} の外です`);
    continue;
  }
  const path = url.slice(origin.length);
  if (path === "app/") continue;
  try {
    await access(`${src}${path}index.html`);
  } catch {
    errors.push(`sitemap.xml: ${url} に対応する src/${path}index.html がありません`);
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("検索・AI 向けの情報を確かめました");
