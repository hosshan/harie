import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // GitHub Pages ではサブパス（/app/）に置くため、配信先のパスを環境変数で変えられるようにする
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
        // 今のインストール（start_url から決まる /app/）と同じ ID。変えると別のアプリとして扱われる
        id: ".",
        display: "standalone",
        start_url: ".",
        categories: ["productivity", "utilities"],
        // OS の「このアプリで開く」に JPEG / PNG を出す（FR-FILE-14）。渡された画像は src/pwa.ts の launchQueue で開く
        file_handlers: [
          {
            action: ".",
            accept: { "image/jpeg": [".jpg", ".jpeg"], "image/png": [".png"] },
          },
        ],
        // スマホの共有メニューから画像を受け取る（FR-CAP-09）。POST は public/share-target-sw.js が受ける
        share_target: {
          action: "share-target",
          method: "POST",
          enctype: "multipart/form-data",
          params: {
            files: [
              { name: "image", accept: ["image/jpeg", "image/png", ".jpg", ".jpeg", ".png"] },
            ],
          },
        },
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
        // 共有メニューからの画像を受け取る処理（FR-CAP-09）
        importScripts: ["share-target-sw.js"],
        globPatterns: ["**/*.{js,css,html,wasm,ttf,svg,png}"],
        // Noto Sans JP は 1 ウェイト約 5.5MB あるため、既定の上限（2MB）を上げる
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        // ハングル・簡体字の補助フォント（ADR-0013）は使う人だけが読み込む。
        // 先回りしてキャッシュせず、初めて読み込んだときにキャッシュしてオフラインでも使えるようにする
        globIgnores: ["**/NotoSansKR-*", "**/NotoSansSC-*"],
        runtimeCaching: [
          {
            urlPattern: /\/NotoSans(KR|SC)-[^/]+\.ttf$/,
            handler: "CacheFirst",
            options: { cacheName: "harie-extra-fonts" },
          },
        ],
      },
    }),
  ],
  // WASM を含むパッケージは事前バンドルしない（?url で読み込む .wasm の位置が変わるため）
  optimizeDeps: { exclude: ["@resvg/resvg-wasm", "@jsquash/jpeg"] },
  build: { target: "es2022" },
});
