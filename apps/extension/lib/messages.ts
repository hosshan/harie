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
  pageGithub: "GitHub で注釈データを文字で表示する",
  pageAllSites: "ほかのサイトでも画像から編集を開く",
  pageNote:
    "オンにすると、そのサイトの画像を読む権限を求めます。画像はこの端末の中で読み、どこにも送りません。",
  editOnImage: "Harie で編集",
  editFailed: "画像を開けませんでした",
  panelTitle: "Harie の注釈データ",
  panelTitleWith: (label: string) => `Harie の注釈データ（${label}）`,
  diffBefore: "変更前",
  diffAfter: "変更後",
  panelJson: "JSON",
  panelCopyText: "テキストをコピー",
  panelCopyJson: "JSON をコピー",
  panelCopied: "コピーしました",
  panelEmpty: "（文字の注釈はありません）",
  panelMismatch: "画像が Harie の外で編集されています。注釈データは保存したときのものです。",
  panelLoading: "注釈データを読み込み中…",
  panelFailed: "注釈データを読み込めませんでした",
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
  pageGithub: "Show annotation data as text on GitHub",
  pageAllSites: "Open images for editing on other sites too",
  pageNote:
    "Turning these on asks for permission to read images on those sites. Images are read on this device and sent nowhere.",
  editOnImage: "Edit in Harie",
  editFailed: "Couldn't open the image",
  panelTitle: "Harie annotation data",
  panelTitleWith: (label) => `Harie annotation data (${label})`,
  diffBefore: "before",
  diffAfter: "after",
  panelJson: "JSON",
  panelCopyText: "Copy text",
  panelCopyJson: "Copy JSON",
  panelCopied: "Copied",
  panelEmpty: "(No text annotations)",
  panelMismatch:
    "The image was edited outside Harie. This annotation data is from when it was saved.",
  panelLoading: "Loading annotation data…",
  panelFailed: "Couldn't load the annotation data",
};

const CATALOG: Record<Locale, ExtensionMessages> = { ja, en };

export function extensionMessages(locale: Locale): ExtensionMessages {
  return CATALOG[locale];
}
