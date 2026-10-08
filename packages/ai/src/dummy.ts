// ダミー値（FR-PII-02）。画面の意味が伝わるよう、元の値と同じ種類・同じような形の値にする。
// 実在しうる値（実在の住所・使われている電話番号など）を使わない
import type { PiiKind } from "@harie/model";

const JA_NAMES = ["佐藤 花子", "鈴木 一郎", "高橋 美咲", "田中 健太", "伊藤 さくら", "渡辺 大輔"];
const EN_NAMES = ["Hanako Sato", "Ichiro Suzuki", "Misaki Takahashi", "Kenta Tanaka"];

const hasJapanese = (s: string) => /[぀-ヿ㐀-鿿]/.test(s);

/**
 * 種類と元の文字列から、置き換えるダミー値を作る。同じ画像の中で値が重ならないよう index で選ぶ。
 * 元の文字列は形（日本語か、区切り文字の位置）を見るためだけに使い、戻り値に元の文字を残さない。
 */
export function dummyFor(kind: PiiKind, original: string, index = 0): string {
  switch (kind) {
    case "name": {
      const names = hasJapanese(original) ? JA_NAMES : EN_NAMES;
      return names[index % names.length] as string;
    }
    case "email":
      // example.com は例示用に予約されたドメイン（RFC 2606）
      return `user${index + 1}@example.com`;
    case "phone":
    case "id":
      // 数字は 0、英字は X にして、区切り（ハイフン・空白）の形だけを残す
      return original.replace(/[0-9０-９]/g, "0").replace(/[A-Za-zＡ-Ｚａ-ｚ]/g, "X");
    case "address":
      return hasJapanese(original) ? "東京都〇〇区△△ 1-2-3" : "1-2-3 Example St.";
    case "face":
    case "other":
      return "＊＊＊";
  }
}
