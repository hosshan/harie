// 英語版の LP（src/en/index.html）から、韓国語・繁體中文・简体中文・スペイン語・ポルトガル語（ブラジル）の
// LP（src/<言語>/index.html）を作る。訳は i18n/<言語>.json に「英語の文 → 訳」で持つ（NFR-I18N-01）。
//
//   node scripts/translate.mjs          # src/<言語>/index.html を書き出す
//   node scripts/translate.mjs --check  # 書き出し済みのページが英語版・訳と合っているかだけ確かめる（build から呼ぶ）
//
// 英語版の文を変えると、訳の見出し（英語の文）と合わなくなり、--check と書き出しが止まる。
// そのときは i18n/<言語>.json の該当する項目を新しい英語の文に合わせて直す。
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const src = `${root}src/`;
const origin = "https://harie.studio/";

/** 生成する言語。dir は URL のパス、hl は Chrome ウェブストアの表示言語、og は og:locale */
export const GENERATED = [
  { lang: "ko", dir: "ko", hl: "ko", og: "ko_KR", font: "Noto+Sans+KR:wght@400;700;900" },
  { lang: "zh-TW", dir: "zh-tw", hl: "zh-TW", og: "zh_TW", font: "Noto+Sans+TC:wght@400;700;900" },
  { lang: "zh-CN", dir: "zh-cn", hl: "zh-CN", og: "zh_CN", font: "Noto+Sans+SC:wght@400;700;900" },
  { lang: "es", dir: "es", hl: "es", og: "es_ES" },
  { lang: "pt-BR", dir: "pt-br", hl: "pt-BR", og: "pt_BR" },
];

/** LP の全言語（ヘッダーの言語メニューと hreflang の順）。path はサイトの根からの位置、short は狭い画面のメニューの札に出す略称 */
export const ALL = [
  { lang: "ja", path: "", name: "日本語", short: "JA", og: "ja_JP" },
  { lang: "en", path: "en/", name: "English", short: "EN", og: "en_US" },
  { lang: "ko", path: "ko/", name: "한국어", short: "KO" },
  { lang: "zh-TW", path: "zh-tw/", name: "繁體中文", short: "繁中" },
  { lang: "zh-CN", path: "zh-cn/", name: "简体中文", short: "简中" },
  { lang: "es", path: "es/", name: "Español", short: "ES" },
  { lang: "pt-BR", path: "pt-br/", name: "Português (Brasil)", short: "PT" },
];

/** 訳さない文（製品名・コード・ファイル名など）。英語版に現れても訳が要らない */
const KEEP = new Set([
  "Harie",
  "AI",
  "MCP",
  "GitHub",
  "Web",
  "Claude Code",
  "Claude Desktop",
  "ChatGPT",
  "@harie/mcp",
  "npx",
  "--root",
  "~/.codex/config.toml",
  "claude_desktop_config.json",
  "tasklane-notifications.en.harie.png",
  "147 KB",
  "harie_open → harie_edit",
  "claude mcp add harie -- npx -y @harie/mcp --root ~/Pictures/guides",
  "website",
  "summary_large_image",
  "width=device-width, initial-scale=1.0",
  "#D4A72C",
]);

const norm = (s) => s.replace(/\s+/g, " ").trim();
const escHtml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&#x27;");
const escAttr = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
const decode = (s) =>
  s
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

/** ヘッダーの言語メニュー。current の言語を選択中にし、リンクは prefix（ページからサイトの根への相対パス）から作る */
export function langMenu(current, prefix, label) {
  const { name, short } = ALL.find((l) => l.lang === current) ?? {};
  const items = ALL.map((l) => {
    const href = `${prefix}${l.path}` || "./";
    const cur = l.lang === current ? ' aria-current="page"' : "";
    return `            <li><a href="${href}" hreflang="${l.lang}" lang="${l.lang}"${cur}>${l.name}</a></li>`;
  }).join("\n");
  return `<details class="lang">
          <summary aria-label="${escAttr(label)}"><span class="lang-full">${name}</span><span class="lang-short">${short}</span></summary>
          <ul class="lang-menu">
${items}
          </ul>
        </details>`;
}

/** <head> の hreflang（全言語 + x-default） */
export function hreflangLinks(indent = "    ") {
  return [
    ...ALL.map(
      (l) => `${indent}<link rel="alternate" hreflang="${l.lang}" href="${origin}${l.path}" />`,
    ),
    `${indent}<link rel="alternate" hreflang="x-default" href="${origin}" />`,
  ].join("\n");
}

function translatePage(html, target, dict) {
  const missing = new Set();
  const used = new Set();
  const t = (s) => {
    const key = norm(decode(s));
    if (key === "" || !/[A-Za-z]/.test(key) || KEEP.has(key)) return null;
    // URL・og:locale の値・言語メニューの言語名は訳さない
    if (/^https?:\/\//.test(key) || /^[a-z]{2}_[A-Z]{2}$/.test(key)) return null;
    if (ALL.some((l) => l.name === key || l.short === key)) return null;
    if (dict[key] === undefined) {
      missing.add(key);
      return null;
    }
    used.add(key);
    return dict[key];
  };

  // JSON-LD は JSON として訳す
  html = html.replace(
    /(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/,
    (_, open, json, close) => {
      const data = JSON.parse(json);
      for (const node of data["@graph"]) {
        if (node.inLanguage !== undefined && Array.isArray(node.inLanguage)) {
          node.inLanguage = ALL.map((l) => l.lang);
        }
        if (node["@type"] === "SoftwareApplication") {
          node.url = `${origin}${target.dir}/`;
          node.description = t(node.description) ?? node.description;
        }
        if (node["@type"] === "FAQPage") {
          node["@id"] = `${origin}${target.dir}/#faq`;
          node.url = `${origin}${target.dir}/`;
          node.inLanguage = target.lang;
          for (const q of node.mainEntity) {
            q.name = t(q.name) ?? q.name;
            q.acceptedAnswer.text = t(q.acceptedAnswer.text) ?? q.acceptedAnswer.text;
          }
        }
      }
      const body = JSON.stringify(data, null, 2).replace(/\n/g, "\n      ");
      return `${open}\n      ${body}\n    ${close}`;
    },
  );

  // 訳さない塊（コード）を退避する
  const stash = [];
  html = html.replace(/<(pre|code)\b[\s\S]*?<\/\1>|<script[\s\S]*?<\/script>/g, (m) => {
    stash.push(m);
    return `\uE000${stash.length - 1}\uE000`;
  });

  // 属性値
  html = html.replace(
    /\b(alt|aria-label|content|data-copied|title)="([^"]*)"/g,
    (m, name, value) => {
      const tr = t(value);
      return tr === null ? m : `${name}="${escAttr(tr)}"`;
    },
  );
  // 文字（タグの間）。前後の空白は残す
  // 退避したコードを挟む文は、コードの前後を別々に訳す
  const translateText = (text) => {
    const tr = t(text);
    if (tr === null) return text;
    const lead = text.match(/^\s*/)[0];
    const trail = text.match(/\s*$/)[0];
    return `${lead}${escHtml(tr)}${trail}`;
  };
  html = html.replace(
    />([^<>]+)</g,
    (_, text) =>
      `>${text
        .split(/(\uE000\d+\uE000)/)
        .map((part, i) => (i % 2 === 1 ? part : translateText(part)))
        .join("")}<`,
  );

  html = html.replace(/\uE000(\d+)\uE000/g, (_, i) => stash[Number(i)]);
  const unused = Object.keys(dict).filter((k) => !used.has(k));
  return { html, missing: [...missing], unused };
}

function localize(html, target) {
  // 言語・URL・言語メニュー
  html = html
    .replace('<html lang="en">', `<html lang="${target.lang}">`)
    .replace(
      '<link rel="canonical" href="https://harie.studio/en/" />',
      `<link rel="canonical" href="${origin}${target.dir}/" />`,
    )
    .replace(
      '<meta property="og:url" content="https://harie.studio/en/" />',
      `<meta property="og:url" content="${origin}${target.dir}/" />`,
    )
    .replace(
      '<meta property="og:locale" content="en_US" />',
      `<meta property="og:locale" content="${target.og}" />`,
    )
    .replace(
      / {4}<link rel="alternate" hreflang[\s\S]*?hreflang="x-default"[^\n]*\n/,
      `${hreflangLinks()}\n`,
    )
    .replace(/<details class="lang">[\s\S]*?<\/details>/, langMenu(target.lang, "../", "Language"))
    .replaceAll("?hl=en", `?hl=${target.hl}`)
    // プライバシーポリシーは日本語版と英語版だけ
    .replaceAll('href="privacy/"', 'href="../en/privacy/"');
  if (target.font) {
    html = html.replace(
      '<link rel="stylesheet" href="../styles.css" />',
      `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${target.font}&display=swap" />\n    <link rel="stylesheet" href="../styles.css" />`,
    );
  }
  return html;
}

export async function generate({ check = false } = {}) {
  const en = await readFile(`${src}en/index.html`, "utf8");
  const errors = [];
  for (const target of GENERATED) {
    const dict = JSON.parse(await readFile(`${root}i18n/${target.lang}.json`, "utf8"));
    const { html, missing, unused } = translatePage(localize(en, target), target, dict);
    for (const m of missing) errors.push(`i18n/${target.lang}.json: 訳がありません: ${m}`);
    for (const u of unused) {
      errors.push(`i18n/${target.lang}.json: 英語版にない文です（英語版が変わった？）: ${u}`);
    }
    const out = `${src}${target.dir}/index.html`;
    if (check) {
      const current = await readFile(out, "utf8").catch(() => "");
      if (current !== html) {
        errors.push(
          `src/${target.dir}/index.html が古いです。node apps/site/scripts/translate.mjs で作り直してください`,
        );
      }
    } else if (missing.length === 0) {
      await mkdir(`${src}${target.dir}`, { recursive: true });
      await writeFile(out, html);
    }
  }
  return errors;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const errors = await generate({ check: process.argv.includes("--check") });
  if (errors.length > 0) {
    console.error(errors.join("\n"));
    process.exit(1);
  }
  console.log("各言語の LP を確かめました");
}
