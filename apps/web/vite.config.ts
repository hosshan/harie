import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // WASM を含むパッケージは事前バンドルしない（?url で読み込む .wasm の位置が変わるため）
  optimizeDeps: { exclude: ["@resvg/resvg-wasm", "@jsquash/jpeg"] },
  build: { target: "es2022" },
});
