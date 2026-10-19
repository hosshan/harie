import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // GitHub Pages ではサブパス（/harie/app/）に置くため、配信先のパスを環境変数で変えられるようにする
  base: process.env.HARIE_WEB_BASE ?? "/",
  plugins: [
    react(),
    tailwindcss(),
    // PWA（NFR-PLAT-01）。描画エンジン（WASM）とフォントも含めて最初の訪問でキャッシュし、オフラインでも開いて保存できるようにする
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Harie",
        short_name: "Harie",
        description: "スクリーンショットに枠・矢印・説明文を付け、あとから何度でも直せる画像を作る",
        lang: "ja",
        display: "standalone",
        start_url: ".",
        theme_color: "#D4A72C",
        background_color: "#FBF6E9",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,wasm,ttf,svg,png}"],
        // Noto Sans JP は 1 ウェイト約 5.5MB あるため、既定の上限（2MB）を上げる
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
    }),
  ],
  // WASM を含むパッケージは事前バンドルしない（?url で読み込む .wasm の位置が変わるため）
  optimizeDeps: { exclude: ["@resvg/resvg-wasm", "@jsquash/jpeg"] },
  build: { target: "es2022" },
});
