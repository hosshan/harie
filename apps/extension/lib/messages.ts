// 拡張のポップアップ・選択のオーバーレイ・キャプチャの失敗の文言（NFR-I18N-01）。
// エディタページの文言は @harie/web/messages を使う。言語はエディタの設定（拡張の localStorage）と同じものを使い、
// localStorage を読めない service worker・ページに注入するスクリプトには、ポップアップから言語を渡す
import type { Locale, Messages } from "@harie/editor/locale";
import { es, ko, ptBR, zhCN, zhTW } from "./i18n/catalogs";

const ja = {
  popupTitle: "Harie でキャプチャ",
  visible: "見えている範囲",
  region: "範囲を選ぶ",
  element: "要素を選ぶ",
  visibleTip: "今見えている画面をそのまま撮ります",
  regionTip: "ドラッグした範囲を撮ります",
  elementTip: "クリックした要素を、少し余白を付けて撮ります",
  settings: "設定（サイト上の画像ガイド）",
  settingsTitle: "Harie の設定",
  blank: "空のエディタを開く",
  timerLabel: "5 秒待ってから撮る",
  timerTip: "待ってから撮ります。待つ間に、撮りたいメニューやツールチップを出しておけます",
  timerPending: (n: number) => `あと ${n} 秒で撮ります`,
  timerCancel: "やめる",
  timerTabChanged: "タブが切り替わったので撮りませんでした",
  popupNote: "AIを利用しない場合、画像やページ情報は端末内でのみ処理されます。",
  failed: "キャプチャできませんでした",
  failedWith: (detail: string) => `キャプチャできませんでした: ${detail}`,
  restricted:
    "このページはブラウザの制限でキャプチャできません。通常のウェブページで試してください。",
  noTab: "キャプチャするタブがありません",
  emptyRange: "選んだ範囲が空です",
  cropFailed: "画像を切り抜けませんでした",
  dragHint: "撮りたい範囲をドラッグしてください（Esc でやめる）",
  clickHint: "撮りたい要素をクリックしてください（Esc でやめる）",
  pageTitle: "サイト上の画像ガイド",
  pageEdit: "画像に編集ボタンを表示",
  pageCopy: "画像に文章のコピーボタンを表示",
  pageSites: "対象サイト",
  pageSitesAll: "指定がなければ、すべてのサイトを対象にします。",
  pageSiteInput: "追加するサイト",
  pageSitePlaceholder: "例: github.com",
  pageSiteAdd: "追加",
  pageSiteRemove: (site: string) => `${site} を外す`,
  pageSiteInvalid: "ドメインの形で入れてください（例: github.com）",
  pageSiteTooMany: "これ以上は追加できません",
  pageNote:
    "Harie 画像にカーソルを当てたときだけボタンを表示し、画像を読むためにサイトへのアクセス権を求めます。画像はこの端末の中で読み、どこにも送りません。",
  editOnImage: "Harie で編集",
  editFailed: "画像を開けませんでした",
  copyText: "この文章をコピー",
  copyAll: "文章をまとめてコピー",
  copied: "コピーしました",
} as const;

export type ExtensionMessages = Messages<typeof ja>;

const en: ExtensionMessages = {
  popupTitle: "Capture with Harie",
  visible: "Visible area",
  region: "Select an area",
  element: "Select an element",
  visibleTip: "Capture the screen as you see it",
  regionTip: "Capture an area you drag",
  elementTip: "Capture the element you click, with a small margin",
  settings: "Settings (image guides on sites)",
  settingsTitle: "Harie settings",
  blank: "Open a blank editor",
  timerLabel: "Wait 5 seconds before capturing",
  timerTip: "Waits before capturing, so you can open the menu or tooltip you want in the shot",
  timerPending: (n) => `Capturing in ${n} s`,
  timerCancel: "Cancel",
  timerTabChanged: "Didn't capture because the tab changed",
  popupNote: "Unless you use AI, images and page info are processed only on this device.",
  failed: "Couldn't capture",
  failedWith: (detail) => `Couldn't capture: ${detail}`,
  restricted: "The browser doesn't allow capturing this page. Try a regular web page.",
  noTab: "No tab to capture",
  emptyRange: "The selected area is empty",
  cropFailed: "Couldn't crop the image",
  dragHint: "Drag over the area to capture (Esc to cancel)",
  clickHint: "Click the element to capture (Esc to cancel)",
  pageTitle: "Image guides on sites",
  pageEdit: "Show an edit button on images",
  pageCopy: "Show copy buttons for text on images",
  pageSites: "Sites",
  pageSitesAll: "If none are listed, all sites are included.",
  pageSiteInput: "Site to add",
  pageSitePlaceholder: "e.g. github.com",
  pageSiteAdd: "Add",
  pageSiteRemove: (site) => `Remove ${site}`,
  pageSiteInvalid: "Enter a domain (e.g. github.com)",
  pageSiteTooMany: "You can't add more sites",
  pageNote:
    "Buttons appear only while you hover a Harie image, and site access is requested so images can be read. Images are read on this device and sent nowhere.",
  editOnImage: "Edit in Harie",
  editFailed: "Couldn't open the image",
  copyText: "Copy this text",
  copyAll: "Copy all text",
  copied: "Copied",
};

const CATALOG: Record<Locale, ExtensionMessages> = {
  ja,
  en,
  ko,
  "zh-TW": zhTW,
  "zh-CN": zhCN,
  es,
  "pt-BR": ptBR,
};

export function extensionMessages(locale: Locale): ExtensionMessages {
  return CATALOG[locale];
}
