// 拡張のポップアップ・選択のオーバーレイ・キャプチャの失敗の文言（NFR-I18N-01）。
// エディタページの文言は @harie/web/messages を使う。言語はエディタの設定（拡張の localStorage）と同じものを使い、
// localStorage を読めない service worker・ページに注入するスクリプトには、ポップアップから言語を渡す
import type { Locale, Messages } from "@harie/editor/locale";

const ja = {
  popupTitle: "Harie でキャプチャ",
  visible: "見えている範囲",
  region: "範囲を選ぶ",
  element: "要素を選ぶ",
  popupNote:
    "撮った画像は Harie のエディタで開きます。画像とページの情報は、AI を使うまでこの端末から出ません。",
  failed: "キャプチャできませんでした",
  failedWith: (detail: string) => `キャプチャできませんでした: ${detail}`,
  restricted:
    "このページはブラウザの制限でキャプチャできません。通常のウェブページで試してください。",
  noTab: "キャプチャするタブがありません",
  emptyRange: "選んだ範囲が空です",
  cropFailed: "画像を切り抜けませんでした",
  dragHint: "撮りたい範囲をドラッグしてください（Esc でやめる）",
  clickHint: "撮りたい要素をクリックしてください（Esc でやめる）",
  pageTitle: "ページ上の Harie 画像",
  pageEdit: "画像に編集ボタンを出す",
  pageCopy: "画像に説明文のコピーボタンを出す",
  pageScope: "使うサイト",
  pageScopeAll: "すべてのサイト",
  pageScopeGithub: "GitHub だけ",
  pageNote:
    "Harie 画像にカーソルを当てたときにだけボタンが出ます。オンにすると、使うサイトの画像を読む権限を求めます。画像はこの端末の中で読み、どこにも送りません。",
  editOnImage: "Harie で編集",
  editFailed: "画像を開けませんでした",
  copyText: "この説明文をコピー",
  copyAll: "説明文をまとめてコピー",
  copied: "コピーしました",
} as const;

export type ExtensionMessages = Messages<typeof ja>;

const en: ExtensionMessages = {
  popupTitle: "Capture with Harie",
  visible: "Visible area",
  region: "Select an area",
  element: "Select an element",
  popupNote:
    "Captured images open in the Harie editor. The image and page info stay on this device until you use AI.",
  failed: "Couldn't capture",
  failedWith: (detail) => `Couldn't capture: ${detail}`,
  restricted: "The browser doesn't allow capturing this page. Try a regular web page.",
  noTab: "No tab to capture",
  emptyRange: "The selected area is empty",
  cropFailed: "Couldn't crop the image",
  dragHint: "Drag over the area to capture (Esc to cancel)",
  clickHint: "Click the element to capture (Esc to cancel)",
  pageTitle: "Harie images on pages",
  pageEdit: "Show an edit button on images",
  pageCopy: "Show copy buttons for notes on images",
  pageScope: "Sites",
  pageScopeAll: "All sites",
  pageScopeGithub: "GitHub only",
  pageNote:
    "Buttons appear only while you hover a Harie image. Turning these on asks for permission to read images on the chosen sites. Images are read on this device and sent nowhere.",
  editOnImage: "Edit in Harie",
  editFailed: "Couldn't open the image",
  copyText: "Copy this note",
  copyAll: "Copy all notes",
  copied: "Copied",
};

const CATALOG: Record<Locale, ExtensionMessages> = { ja, en };

export function extensionMessages(locale: Locale): ExtensionMessages {
  return CATALOG[locale];
}
