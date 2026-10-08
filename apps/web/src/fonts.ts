// 編集画面の文字を保存時と同じフォント（Noto Sans JP）で表示する（ADR-0005）
import { boldFontUrl, regularFontUrl } from "./browser-renderer";

let fontsLoaded = false;
export function loadDisplayFonts() {
  if (fontsLoaded) return;
  fontsLoaded = true;
  for (const [url, weight] of [
    [regularFontUrl, "400"],
    [boldFontUrl, "700"],
  ] as const) {
    const face = new FontFace("Noto Sans JP", `url(${url})`, { weight });
    document.fonts.add(face);
    face.load().catch(() => {});
  }
}
