import react from "@vitejs/plugin-react";
import { defineConfig } from "wxt";

// E2E では、ツールバーのボタンを押せない（activeTab が付かない）ので、テスト用のビルドにだけ全サイトの権限を付ける
const e2e = process.env.HARIE_E2E === "1";

export default defineConfig({
  outDir: e2e ? ".output-e2e" : ".output",
  manifest: {
    name: "Harie",
    description:
      "表示中のページをキャプチャし、枠・矢印・説明文を付けて、あとから何度でも直せる画像にする",
    // NFR-SEC-03: 常時のサイト権限は取らない。ボタン・ショートカットを押したタブにだけ一時的にアクセスする
    permissions: ["activeTab", "scripting", "downloads"],
    ...(e2e ? { host_permissions: ["<all_urls>"] } : {}),
    // 描画エンジン（resvg・mozjpeg）は WASM なので、拡張ページで WASM のコンパイルだけを許可する
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    },
    action: { default_title: "Harie でキャプチャ" },
    commands: {
      "capture-visible": {
        suggested_key: { default: "Alt+Shift+S" },
        description: "見えている範囲をキャプチャする",
      },
    },
    icons: { 16: "icon/16.png", 32: "icon/32.png", 48: "icon/48.png", 128: "icon/128.png" },
  },
  vite: () => ({
    plugins: [react()],
    // WASM を含むパッケージは事前バンドルしない（?url で読み込む .wasm の位置が変わるため）
    optimizeDeps: { exclude: ["@resvg/resvg-wasm", "@jsquash/jpeg"] },
    build: { target: "es2022" },
  }),
});
