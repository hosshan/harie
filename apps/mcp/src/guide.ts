// 「どこに何を補足するか」の手引き（FR-MCP-08）。AI 提案（@harie/ai）と同じ文面を、MCP のプロンプトと
// サーバーの instructions で LLM クライアントに渡す。手順と座標の決まりはツールの使い方に合わせてここで足す
import { GUIDE_TARGET_RULE, GUIDE_TEXT_RULES, PII_KIND_RULE } from "@harie/ai/guide";

const bullets = (rules: readonly string[]) => rules.map((r) => `- ${r}`).join("\n");

/** サーバーの instructions。クライアントが常に読む前提で短くし、詳しくはプロンプト harie_guide に任せる */
export const SERVER_INSTRUCTIONS = `Harie は、SaaS の利用ガイド用スクリーンショットに枠・吹き出し・番号を付け、普通の JPEG / PNG のまま何度でも再編集できるようにするツールです。
ガイド用の注釈を付けるときの基準:
${bullets([GUIDE_TARGET_RULE, ...GUIDE_TEXT_RULES])}
手順: harie_open で画像と既存の注釈を見る（普通の画像なら harie_create）→ 個人情報があれば harie_mask（confirm なしで確認してから confirm: true）→ harie_preview で確かめて harie_edit で保存。詳しい手引きはプロンプト harie_guide にあります。`;

export function guidePrompt(input: { path: string; intent?: string | undefined }): string {
  const intent = input.intent?.trim();
  return `あなたは SaaS の利用ガイドを書くテクニカルライターです。Harie の MCP ツールを使って、画像「${input.path}」にガイド用の注釈を付けてください。
${intent ? `説明したいこと: ${intent}` : "説明したいことは、画面の主な操作を初めての人に伝えることとします。"}

## 何を強調し、どう書くか
${bullets([GUIDE_TARGET_RULE, ...GUIDE_TEXT_RULES])}

## 手順
1. harie_open で画像と既存の注釈・canvas の大きさを見る。status が plain（普通の画像）なら harie_create で Harie ファイルにしてから進める。
2. 画面に個人情報があれば、注釈より先に harie_mask で隠す。文字は method: replace（同じ種類のダミー値。例: 山田 花子 / hanako@example.com）か fill。まず confirm なしで結果を確かめ、範囲がよければ同じ masks に confirm: true を付けて保存する（元に戻せない）。
   - masks の ${PII_KIND_RULE}
   - 会社名・製品名・ボタンの文言・見出しなど、個人ではない情報は隠さない。
   - ダミーやテスト用に見える値（example.com のメールなど）でも、個人情報の形をしていれば隠すか、利用者に確かめる。
3. 説明する箇所ごとに、次の 3 つを組で置く。
   - rect: UI 要素を少し余白を付けて囲む。
   - callout: 説明文。anchor: { annotationId: 枠の id, side } で枠に紐付けると、枠への矢印が自動で描かれる（arrow を別に引かない）。UI を隠さない余白に置き、縦か横の範囲を枠と重ねると矢印がまっすぐになる。
   - badge: 操作の順の番号（1 から）。吹き出しの左上の角に重ねる。
4. harie_preview で見た目を確かめ、重なり・はみ出し・読みにくさを直してから harie_edit で保存する（expectedRevision に harie_open の revision を渡す）。

## 座標と大きさ
- 座標はベース画像のピクセル（canvas.width × canvas.height）で、左上が原点。Retina のスクリーンショットは画面の 2 倍の大きさになる。
- 文字の大きさ（style.fontSize）と線の太さ（style.strokeWidth）は画像の幅に合わせる。目安は fontSize が幅の 1.1% 前後（幅 3000px なら 34 前後）、strokeWidth が 0.2% 前後（同 6 前後）。`;
}
