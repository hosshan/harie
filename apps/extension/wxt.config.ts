import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "wxt";

// E2E では、ツールバーのボタンを押せない（activeTab が付かない）ので、テスト用のビルドにだけ全サイトの権限を付ける
const e2e = process.env.HARIE_E2E === "1";

export default defineConfig({
  outDir: e2e ? ".output-e2e" : ".output",
  manifest: {
    // 名前・説明・ボタンの題名は public/_locales の文言を使う（ブラウザの言語で切り替わる。NFR-I18N-01）
    name: "__MSG_extName__",
    description: "__MSG_extDescription__",
    default_locale: "en",
    // NFR-SEC-03: 常時のサイト権限は取らない。ボタン・ショートカットを押したタブにだけ一時的にアクセスする
    permissions: ["activeTab", "scripting", "downloads"],
    ...(e2e ? { host_permissions: ["<all_urls>"] } : {}),
    // ページ上の Harie 画像（FR-FILE-12, FR-FILE-13）はオプトイン。ポップアップでオンにしたときだけ求める（lib/page-image.ts）
    optional_host_permissions: [
      "https://github.com/*",
      "https://*.githubusercontent.com/*",
      "<all_urls>",
    ],
    // 描画エンジン（resvg・mozjpeg）は WASM なので、拡張ページで WASM のコンパイルだけを許可する
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    },
    action: { default_title: "__MSG_actionTitle__" },
    commands: {
      "capture-visible": {
        suggested_key: { default: "Alt+Shift+S" },
        description: "__MSG_captureVisible__",
      },
    },
    icons: { 16: "icon/16.png", 32: "icon/32.png", 48: "icon/48.png", 128: "icon/128.png" },
  },
  // ストア提出・GitHub Release に添付する zip の名前
  zip: { artifactTemplate: "harie-extension-{{version}}-{{browser}}.zip" },
  vite: () => ({
    plugins: [react(), tailwindcss()],
    // WASM を含むパッケージは事前バンドルしない（?url で読み込む .wasm の位置が変わるため）
    optimizeDeps: { exclude: ["@resvg/resvg-wasm", "@jsquash/jpeg"] },
    build: { target: "es2022" },
  }),
});
