// 編集画面の文字を保存時と同じフォントで表示する（ADR-0005）。
// ハングル・簡体字の補助フォント（ADR-0013）も登録しておき、画面に現れたときだけブラウザが読み込む
import { EXTRA_FONT_FAMILIES, EXTRA_FONTS } from "@harie/render";
import { boldFontUrl, extraFontUrls, regularFontUrl } from "./browser-renderer";

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
  // load() を呼ばない。SVG の <tspan font-family> で使われたときに読み込まれる
  for (const font of EXTRA_FONTS) {
    for (const [url, weight] of [
      [extraFontUrls[font].regular, "400"],
      [extraFontUrls[font].bold, "700"],
    ] as const) {
      document.fonts.add(new FontFace(EXTRA_FONT_FAMILIES[font], `url(${url})`, { weight }));
    }
  }
}
