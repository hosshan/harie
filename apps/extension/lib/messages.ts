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
  pageSites: "ボタンを出すサイト",
  pageSitesAll: "指定がなければ、すべてのサイトで出します。",
  pageSiteInput: "追加するサイト",
  pageSitePlaceholder: "例: github.com",
  pageSiteAdd: "追加",
  pageSiteRemove: (site: string) => `${site} を外す`,
  pageSiteInvalid: "ドメインの形で入れてください（例: github.com）",
  pageSiteTooMany: "これ以上は追加できません",
  pageNote:
    "Harie 画像にカーソルを当てたときにだけボタンが出ます。オンにすると、画像を読むためにサイトへのアクセス権を求めます（画像は別のドメインから届くことが多いため、すべてのサイトが対象です）。画像はこの端末の中で読み、どこにも送りません。",
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
  pageSites: "Sites to show buttons on",
  pageSitesAll: "If none are listed, buttons appear on all sites.",
  pageSiteInput: "Site to add",
  pageSitePlaceholder: "e.g. github.com",
  pageSiteAdd: "Add",
  pageSiteRemove: (site) => `Remove ${site}`,
  pageSiteInvalid: "Enter a domain (e.g. github.com)",
  pageSiteTooMany: "You can't add more sites",
  pageNote:
    "Buttons appear only while you hover a Harie image. Turning these on asks for site access so images can be read (it covers all sites, since images often come from other domains). Images are read on this device and sent nowhere.",
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
