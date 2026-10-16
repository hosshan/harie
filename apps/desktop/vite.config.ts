import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Tauri の殻が読み込む画面。Web エディタ（@harie/web）と同じ部品を使い、PWA にはしない
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Tauri の CLI の出力を消さない
  clearScreen: false,
  // tauri.conf.json の devUrl と合わせる
  server: { port: 1420, strictPort: true },
  // WASM を含むパッケージは事前バンドルしない（?url で読み込む .wasm の位置が変わるため）
  optimizeDeps: { exclude: ["@resvg/resvg-wasm", "@jsquash/jpeg"] },
  build: { target: "es2022" },
});
