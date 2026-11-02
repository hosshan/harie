// 日本語フォント（Noto Sans JP）にない文字を補うフォント（ADR-0013）。
// 注釈にその文字が現れたときだけ読み込む。フォントのバイト列の取得は呼び出し側（環境ごと）が行う
import { SC_SUPPLEMENT_BITS, SC_SUPPLEMENT_START } from "./extra-font-coverage";

/** 補助フォントの種類。ハングル / Noto Sans JP にない簡体字 */
export const EXTRA_FONTS = ["hangul", "simplified-chinese"] as const;
export type ExtraFont = (typeof EXTRA_FONTS)[number];

/** `packages/render/fonts/` に置いたファイル名（Regular / Bold） */
export const EXTRA_FONT_FILES: Record<ExtraFont, { regular: string; bold: string }> = {
  hangul: { regular: "NotoSansKR-Hangul-400.ttf", bold: "NotoSansKR-Hangul-700.ttf" },
  "simplified-chinese": {
    regular: "NotoSansSC-Supplement-400.ttf",
    bold: "NotoSansSC-Supplement-700.ttf",
  },
};

/**
 * 補助フォントのファミリー名。SVG ではこの文字の範囲を `<tspan font-family>` で囲む。
 * resvg の代替フォント選びは太さを見ないため、ファミリーを明示して太字を正しく選ばせる
 */
export const EXTRA_FONT_FAMILIES: Record<ExtraFont, string> = {
  hangul: "Noto Sans KR",
  "simplified-chinese": "Noto Sans SC",
};

function isHangul(c: number): boolean {
  return (
    (c >= 0x1100 && c <= 0x11ff) ||
    (c >= 0x3130 && c <= 0x318f) ||
    (c >= 0xa960 && c <= 0xa97f) ||
    (c >= 0xac00 && c <= 0xd7ff)
  );
}

let scBits: Uint8Array | undefined;

function decodeBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function inScSupplement(c: number): boolean {
  const i = c - SC_SUPPLEMENT_START;
  if (i < 0) return false;
  scBits ??= decodeBase64(SC_SUPPLEMENT_BITS);
  const byte = scBits[i >> 3];
  return byte !== undefined && (byte & (1 << (i & 7))) !== 0;
}

/** 文字（UTF-16 のコード単位）を描くのに要る補助フォント。Noto Sans JP で描けるなら null */
export function extraFontOf(c: number): ExtraFont | null {
  // 補助フォントが扱うのは U+1100 以上の BMP の文字だけ。ASCII などは早く飛ばす
  if (c < 0x1100) return null;
  if (isHangul(c)) return "hangul";
  if (inScSupplement(c)) return "simplified-chinese";
  return null;
}

/** テキストを描くのに要る補助フォント。日本語・英語だけなら空 */
export function requiredExtraFonts(text: string): ExtraFont[] {
  let hangul = false;
  let sc = false;
  for (let i = 0; i < text.length; i++) {
    const f = extraFontOf(text.charCodeAt(i));
    if (f === "hangul") hangul = true;
    else if (f === "simplified-chinese") sc = true;
    if (hangul && sc) break;
  }
  const out: ExtraFont[] = [];
  if (hangul) out.push("hangul");
  if (sc) out.push("simplified-chinese");
  return out;
}
