// Web エディタの画面（ヘッダー・保存・設定・連携・AI）の文言。拡張のエディタページとデスクトップ版も使う。
// 日本語を元にし、ほかの言語は同じ形（Messages 型）で用意する（NFR-I18N-01）。英語以外は ./i18n/ に置く

import { getLocale, type Locale, type Messages, useMessages } from "@harie/editor";
import type { MismatchReason } from "@harie/format";
import { es } from "./i18n/es";
import { ko } from "./i18n/ko";
import { ptBR } from "./i18n/pt-BR";
import { zhCN } from "./i18n/zh-CN";
import { zhTW } from "./i18n/zh-TW";

const ja = {
  header: {
    more: "その他の操作",
    settings: "設定",
  },
  open: {
    button: "画像を開く",
    dropHint: (paste: string) =>
      `スクリーンショットをドラッグ＆ドロップするか、貼り付け（${paste}）してください。`,
    formats:
      "JPEG・PNG のほか、SVG・WebP・GIF・HEIC なども開けます（保存は JPEG か PNG）。保存した画像は普通の画像として使え、Harie で開けば注釈を直せます。",
    integrations:
      "Chrome 拡張でのキャプチャと、Claude からの編集（MCP）の始め方は、右上の「連携」（狭い画面では「…」の中）にあります。",
    fileInput: "画像ファイル",
    imageFiles: "画像",
    jpegFiles: "JPEG 画像",
    pngFiles: "PNG 画像",
    confirmTitle: "別の画像を開きますか？",
    confirmBody: (fileName: string) => `今の画像（${fileName}）を閉じて、別の画像を開きます。`,
    confirmUnsaved: "保存していない変更は失われます。",
    cancel: "キャンセル",
    choose: "画像を選ぶ",
    loading: "読み込んでいます…",
  },
  load: {
    unsupported:
      "画像として読めないファイルです。JPEG・PNG・SVG・WebP・GIF・HEIC などの画像を開いてください。",
    corrupted: "画像が壊れているため開けません。",
    noSize: "画像の大きさを読めません。",
    decodeFailed: (type: string) => `この ${type} 画像を読み込めませんでした。`,
    mismatch: {
      PayloadMissing: "注釈データの一部が失われています。画像だけを開きました。",
      PayloadCorrupted: "注釈データが壊れています。画像だけを開きました。",
      RenderedImageModified:
        "画像が別のアプリで編集されています。保存されていた注釈と元の画像で開きました（別のアプリでの変更は反映されていません）。",
      UnsupportedVersion:
        "新しいバージョンの Harie で保存されたファイルです。画像だけを開きました。",
      InvalidDocument: "注釈データを読めません。画像だけを開きました。",
    } satisfies Record<MismatchReason, string>,
    keepAnnotations: "保存されていた注釈で編集する",
    useCurrentImage: "今の画像を新しい下地にする（注釈は消えます）",
  },
  save: {
    button: "保存",
    saving: "保存しています…",
    saved: (fileName: string) => `${fileName} を保存しました`,
    failed: (detail: string) => `保存できませんでした: ${detail}`,
    cancelled: "保存をやめました",
    format: "保存形式",
    formatButton: (label: string) => `ファイル形式: ${label}`,
    jpegNote: "ファイルが小さい",
    pngNote: "文字がくっきり残る",
  },
  copy: {
    button: "コピー",
    copying: "画像をコピーしています…",
    copied: "画像をコピーしました",
    failed: (detail: string) => `コピーできませんでした: ${detail}`,
  },
  replace: {
    button: "画像を差し替える",
    input: "差し替える画像",
    notImage: "画像（JPEG・PNG・SVG・WebP・GIF・HEIC など）を選んでください",
    done: "画像を差し替えました。",
    resized: "注釈を新しい画像の大きさに合わせました。",
    remask: (n: number) => `前の画像でマスクしていた ${n} か所は、かけ直してください`,
  },
  resize: {
    button: "サイズ変更",
    title: "保存する画像のサイズ",
    description:
      "保存・コピーする画像だけをこの大きさで描きます。元の画像と注釈はそのまま残るので、あとから何度でも変えられます。",
    original: (w: number, h: number) => `元の画像: ${w} × ${h} px`,
    width: "幅（W）",
    height: "高さ（H）",
    keepAspect: "縦横比を保つ",
    presets: "倍率",
    invalid: (max: number) => `幅と高さは 1〜${max} の整数で入力してください`,
    cancel: "キャンセル",
    apply: "変更する",
    done: (w: number, h: number) => `保存する画像のサイズを ${w} × ${h} px にしました`,
    reset: "保存する画像のサイズを元の大きさに戻しました",
  },
  masks: {
    applied: (n: number) =>
      `${n} か所をマスクしました。保存するまでは、範囲を選んで隠すのをやめられます`,
    unmasked: "隠すのをやめました",
  },
  settings: {
    title: "設定",
    close: "閉じる",
    language: "表示言語",
    languageNote: "画面の表示に使う言語です。注釈の文字は変わりません。",
    ai: "AI に関する設定",
    aiNote:
      "AI による説明の提案と、画像からの個人情報の検出には、AI のサービスへの接続が必要です。OpenRouter で接続するか、Anthropic の API キーを登録してください。キーはこのブラウザにだけ保存し、ファイルには含めません。",
    aiNoteKeyOnly:
      "AI による説明の提案と、画像からの個人情報の検出には、Anthropic の API キーが必要です。キーはここにだけ保存し、ファイルには含めません。",
    keySteps: [
      "下のリンクから Anthropic Console にログインし、「Create Key」でキーを作ります。",
      "作ったキー（sk-ant- で始まる文字列）を貼り付けて登録します。",
    ],
    keyLink: "API キーを作る（Anthropic Console）",
    keyBilling: "利用料は使った分だけ Anthropic から請求されます。Harie への支払いはありません。",
    openRouterTitle: "OpenRouter で接続する（キーの貼り付け不要）",
    openRouterNote:
      "OpenRouter のアカウントでログインして許可すると、キーを貼らずに使えます。利用料は OpenRouter のクレジットから使った分だけ支払います。",
    openRouterConnect: "OpenRouter で接続",
    openRouterWaiting: "開いたウィンドウで許可してください。",
    openRouterBlocked:
      "ウィンドウを開けませんでした。ポップアップを許可してから、もう一度押してください。",
    openRouterConnected: "OpenRouter で接続済みです。",
    openRouterDisconnect: "接続を解除",
    anthropicTitle: "Anthropic の API キーを使う",
    apiKey: "API キー",
    register: "キーを登録",
    registered: "API キーは登録済みです。",
    remove: "API キーを削除",
  },
  guide: {
    button: "連携",
    title: "ほかのツールと使う",
    close: "閉じる",
    extensionLabel: "Chrome 拡張",
    extensionTitle: "Chrome 拡張でキャプチャする",
    extensionAbout:
      "表示中のページを撮って、そのまま Harie で注釈を付けられます。見えている範囲・ドラッグした範囲・ボタンなどの要素を選んで撮れます。",
    extensionStore: "Chrome ウェブストアで入れる",
    extensionStep1: "Chrome ウェブストアの Harie のページで「Chrome に追加」を押します。",
    extensionStep2: (file: string) => [
      "ツールバーの Harie を押すか Alt+Shift+S で撮れます。保存した ",
      file,
      " はこの Web 版でも開いて直せます。",
    ],
    mcpTitle: "Claude から編集する（MCP）",
    mcpAbout: (pkg: string, root: string) => [
      "MCP サーバー ",
      pkg,
      " を登録すると、Claude に「保存ボタンを赤枠で囲んで」のように頼んで注釈を付け・直せます。Node.js 22 以上が必要です。操作できるのは ",
      root,
      " で指定したフォルダの中だけです。",
    ],
    claudeCodeCommand: "Claude Code に登録するコマンド",
    desktopAbout: (file: string) => [
      "",
      file,
      " に追加します。フォルダは自分のパスに変えてください。",
    ],
    desktopConfig: "Claude Desktop の設定",
    copy: "コピー",
    copied: "コピーしました",
    copyLabel: (label: string) => `${label}をコピー`,
    appLabel: "アプリ",
    appTitle: "アプリとして使う",
    appAbout:
      "パソコンやスマホにアプリとして入れると、ブラウザを開かずに起動でき、オフラインでも使えます。JPEG・PNG を「このアプリで開く」から開いたり、スマホの共有メニューから画像を送ったりできます。",
    appInstall: "アプリとしてインストール",
    appInstalled: "アプリとして開いています。",
    appManual:
      "ブラウザのメニューの「アプリをインストール」（Safari は「ホーム画面に追加」または「Dock に追加」）から入れられます。",
  },
  ai: {
    title: "AIでガイドを作成",
    action: "AI提案",
    cancel: "キャンセル",
    intent: "説明したいこと",
    intentPlaceholder: "説明したいこと（例：通知の設定方法）",
    notice: (withDom: boolean, provider: "anthropic" | "openrouter") =>
      `ボタンを押すと、この画像${withDom ? "と、キャプチャしたページの文字・要素の位置" : ""}を${provider === "openrouter" ? " OpenRouter 経由で Anthropic の Claude" : " Anthropic の Claude API"} に送信します。個人情報が写っている場合は、先に隠してから使ってください。`,
    consent: "この画像を送信してよい",
    suggest: "AI に提案してもらう",
    detectPii: "AI で画像から探す",
    piiTitle: "個人情報を探す",
    localNote:
      "キャプチャしたページの文字から、メールアドレス・電話番号・氏名欄などを探します。画像はどこにも送りません。画像の中の文字や顔は見つけられないので、目でも確認してください。",
    detectPiiLocal: "ページの文字から探す",
    noPiiLocal:
      "ページの文字には個人情報らしきものはありませんでした。画像の中も目で確認してください",
    needKey:
      "AI による説明の提案を使うには、設定で OpenRouter に接続するか、API キーを登録してください。",
    openSettings: "設定を開く",
    suggesting: "AI が画像を見ています…",
    detecting: "個人情報を探しています…",
    noSuggestions: "提案はありませんでした",
    suggested: (n: number) => `${n} 件の提案を追加しました。採用したものだけが保存されます`,
    noPii: "個人情報らしきものは見つかりませんでした。念のため目でも確認してください",
    piiFound: (n: number) =>
      `${n} か所の候補をマスクの範囲にしました。確認してから適用してください`,
    suggestions: (n: number) => `提案（${n} 件）`,
    adopt: "採用",
    reject: "却下",
    adoptAll: "すべて採用",
    rejectAll: "すべて却下",
    errors: {
      auth: "API キーが正しくないか、使える権限がありません",
      credits: "OpenRouter のクレジットが足りません。OpenRouter でクレジットを追加してください",
      "rate-limit": "利用の上限に達しました。しばらくしてから試してください",
      refusal: "この画像は AI で処理できませんでした",
      "invalid-output": "AI の応答を読み取れませんでした",
      network: "AI のサービスに接続できませんでした",
      other: "AI の呼び出しに失敗しました",
    },
  },
  openRouter: {
    connecting: "OpenRouter と接続しています…",
    done: "接続しました。このウィンドウを閉じて Harie に戻ってください。",
    failed: "接続できませんでした。Harie の設定から、もう一度試してください。",
  },
  desktop: {
    discardOpen: "保存していない変更があります。保存せずに開くと、変更は失われます。",
    discardClose: "保存していない変更があります。保存せずに閉じると、変更は失われます。",
    discardOk: (action: "open" | "close") =>
      action === "open" ? "保存せずに開く" : "保存せずに閉じる",
    cancel: "キャンセル",
  },
  extension: {
    notFound: "キャプチャが見つかりません。もう一度キャプチャしてください。",
  },
} as const;

export type WebMessages = Messages<typeof ja>;

const en: WebMessages = {
  header: {
    more: "More actions",
    settings: "Settings",
  },
  open: {
    button: "Open image",
    dropHint: (paste) => `Drag and drop a screenshot, or paste it (${paste}).`,
    formats:
      "Besides JPEG and PNG, you can open SVG, WebP, GIF, HEIC and more (saved as JPEG or PNG). Saved images work as ordinary images, and you can edit the annotations again by opening them in Harie.",
    integrations:
      "To capture with the Chrome extension or edit from Claude (MCP), see “Integrations” at the top right (inside “…” on narrow screens).",
    fileInput: "Image file",
    imageFiles: "Images",
    jpegFiles: "JPEG image",
    pngFiles: "PNG image",
    confirmTitle: "Open another image?",
    confirmBody: (fileName) => `This closes the current image (${fileName}) and opens another one.`,
    confirmUnsaved: "Unsaved changes will be lost.",
    cancel: "Cancel",
    choose: "Choose image",
    loading: "Loading…",
  },
  load: {
    unsupported:
      "This file can't be read as an image. Please open a JPEG, PNG, SVG, WebP, GIF, HEIC or similar image.",
    corrupted: "This image is damaged and can't be opened.",
    noSize: "Couldn't read the image size.",
    decodeFailed: (type: string) => `Couldn't read this ${type} image.`,
    mismatch: {
      PayloadMissing: "Part of the annotation data is missing. Opened the image only.",
      PayloadCorrupted: "The annotation data is damaged. Opened the image only.",
      RenderedImageModified:
        "This image was edited in another app. Opened it with the saved annotations and the original image (changes made in the other app are not included).",
      UnsupportedVersion: "This file was saved by a newer version of Harie. Opened the image only.",
      InvalidDocument: "Couldn't read the annotation data. Opened the image only.",
    },
    keepAnnotations: "Edit with the saved annotations",
    useCurrentImage: "Use the current image as the new base (annotations will be removed)",
  },
  save: {
    button: "Save",
    saving: "Saving…",
    saved: (fileName) => `Saved ${fileName}`,
    failed: (detail) => `Couldn't save: ${detail}`,
    cancelled: "Save cancelled",
    format: "Save format",
    formatButton: (label) => `File format: ${label}`,
    jpegNote: "Smaller file",
    pngNote: "Sharper text",
  },
  copy: {
    button: "Copy",
    copying: "Copying the image…",
    copied: "Copied the image",
    failed: (detail) => `Couldn't copy: ${detail}`,
  },
  replace: {
    button: "Replace image",
    input: "Replacement image",
    notImage: "Please choose an image (JPEG, PNG, SVG, WebP, GIF, HEIC, etc.)",
    done: "Replaced the image. ",
    resized: "Annotations were resized to fit the new image. ",
    remask: (n) =>
      `Please mask again the ${n} ${n === 1 ? "area" : "areas"} you had masked in the previous image`,
  },
  resize: {
    button: "Resize",
    title: "Saved image size",
    description:
      "Only the image you save or copy is drawn at this size. The original image and annotations are kept, so you can change it again anytime.",
    original: (w, h) => `Original image: ${w} × ${h} px`,
    width: "Width (W)",
    height: "Height (H)",
    keepAspect: "Keep aspect ratio",
    presets: "Scale",
    invalid: (max) => `Enter whole numbers from 1 to ${max} for width and height`,
    cancel: "Cancel",
    apply: "Resize",
    done: (w, h) => `Saved image size set to ${w} × ${h} px`,
    reset: "Saved image size reset to the original",
  },
  masks: {
    applied: (n) =>
      `Masked ${n} ${n === 1 ? "area" : "areas"}. Until you save, you can select an area and unhide it`,
    unmasked: "Unhid the area",
  },
  settings: {
    title: "Settings",
    close: "Close",
    language: "Language",
    languageNote: "The language of the screens. Annotation text isn't changed.",
    ai: "AI settings",
    aiNote:
      "AI suggestions and finding personal info in the image need a connection to an AI service. Connect with OpenRouter or save an Anthropic API key. Keys are stored only in this browser and are never included in files.",
    aiNoteKeyOnly:
      "AI suggestions and finding personal info in the image need an Anthropic API key. The key is stored only here and is never included in files.",
    keySteps: [
      "Sign in to the Anthropic Console from the link below and create a key with “Create Key”.",
      "Paste the key (it starts with sk-ant-) and save it.",
    ],
    keyLink: "Create an API key (Anthropic Console)",
    keyBilling: "Anthropic bills you only for what you use. You pay nothing to Harie.",
    openRouterTitle: "Connect with OpenRouter (no key to paste)",
    openRouterNote:
      "Sign in to OpenRouter and allow access to use AI without pasting a key. Usage is paid from your OpenRouter credits.",
    openRouterConnect: "Connect with OpenRouter",
    openRouterWaiting: "Allow access in the window that opened.",
    openRouterBlocked: "Couldn't open a window. Allow pop-ups and press the button again.",
    openRouterConnected: "Connected with OpenRouter.",
    openRouterDisconnect: "Disconnect",
    anthropicTitle: "Use an Anthropic API key",
    apiKey: "API key",
    register: "Save key",
    registered: "An API key is saved.",
    remove: "Remove API key",
  },
  guide: {
    button: "Integrations",
    title: "Use with other tools",
    close: "Close",
    extensionLabel: "Chrome extension",
    extensionTitle: "Capture with the Chrome extension",
    extensionAbout:
      "Capture the page you're viewing and annotate it right away in Harie. You can capture the visible area, a dragged area, or an element such as a button.",
    extensionStore: "Get it on the Chrome Web Store",
    extensionStep1: "On Harie's Chrome Web Store page, click “Add to Chrome”.",
    extensionStep2: (file) => [
      "Click Harie in the toolbar or press Alt+Shift+S to capture. Saved ",
      file,
      " files can also be opened and edited in this web version.",
    ],
    mcpTitle: "Edit from Claude (MCP)",
    mcpAbout: (pkg, root) => [
      "Register the MCP server ",
      pkg,
      " and you can ask Claude things like “put a red box around the Save button” to add and fix annotations. Requires Node.js 22 or later. It can only work inside the folder given with ",
      root,
      ".",
    ],
    claudeCodeCommand: "Command to register with Claude Code",
    desktopAbout: (file) => ["Add this to ", file, ". Change the folder to your own path."],
    desktopConfig: "Claude Desktop configuration",
    copy: "Copy",
    copied: "Copied",
    copyLabel: (label) => `Copy ${label.charAt(0).toLowerCase()}${label.slice(1)}`,
    appLabel: "App",
    appTitle: "Use as an app",
    appAbout:
      "Install Harie as an app on your computer or phone to launch it without opening the browser and use it offline. You can open JPEG and PNG files with “Open with”, or send images from your phone’s share menu.",
    appInstall: "Install as an app",
    appInstalled: "You are using Harie as an app.",
    appManual:
      "Install it from your browser menu with “Install app” (in Safari, “Add to Home Screen” or “Add to Dock”).",
  },
  ai: {
    title: "Create a guide with AI",
    action: "AI suggest",
    cancel: "Cancel",
    intent: "What to explain",
    intentPlaceholder: "What to explain (e.g. how to set up notifications)",
    notice: (withDom, provider) =>
      `When you press a button, this image${withDom ? " and the text and element positions of the captured page" : ""} will be sent to ${provider === "openrouter" ? "Anthropic's Claude through OpenRouter" : "Anthropic's Claude API"}. If personal info is visible, hide it first.`,
    consent: "OK to send this image",
    suggest: "Get AI suggestions",
    detectPii: "Search the image with AI",
    piiTitle: "Find personal info",
    localNote:
      "Looks for email addresses, phone numbers, name fields and more in the text of the captured page. Nothing is sent anywhere. Text and faces inside the image can't be found this way, so check with your own eyes too.",
    detectPiiLocal: "Search the page text",
    noPiiLocal:
      "No personal info found in the page text. Please check the image with your own eyes, too",
    needKey: "To get AI suggestions, connect with OpenRouter or save an API key in Settings.",
    openSettings: "Open settings",
    suggesting: "AI is looking at the image…",
    detecting: "Looking for personal info…",
    noSuggestions: "No suggestions",
    suggested: (n) =>
      `Added ${n} ${n === 1 ? "suggestion" : "suggestions"}. Only the ones you accept will be saved`,
    noPii: "No personal info found. Please check with your own eyes, too",
    piiFound: (n) =>
      `Added ${n} ${n === 1 ? "candidate" : "candidates"} as mask areas. Review them before applying`,
    suggestions: (n) => `Suggestions (${n})`,
    adopt: "Accept",
    reject: "Reject",
    adoptAll: "Accept all",
    rejectAll: "Reject all",
    errors: {
      auth: "The API key is wrong or doesn't have permission",
      credits: "Not enough OpenRouter credits. Add credits on OpenRouter",
      "rate-limit": "You've hit the usage limit. Please try again later",
      refusal: "AI couldn't process this image",
      "invalid-output": "Couldn't read the AI's response",
      network: "Couldn't connect to the AI service",
      other: "The AI call failed",
    },
  },
  openRouter: {
    connecting: "Connecting with OpenRouter…",
    done: "Connected. Close this window and go back to Harie.",
    failed: "Couldn't connect. Please try again from Harie's settings.",
  },
  desktop: {
    discardOpen:
      "You have unsaved changes. If you open another file without saving, they will be lost.",
    discardClose: "You have unsaved changes. If you close without saving, they will be lost.",
    discardOk: (action) => (action === "open" ? "Open without saving" : "Close without saving"),
    cancel: "Cancel",
  },
  extension: {
    notFound: "Capture not found. Please capture again.",
  },
};

export const WEB_MESSAGES: Record<Locale, WebMessages> = {
  ja,
  en,
  ko,
  "zh-TW": zhTW,
  "zh-CN": zhCN,
  es,
  "pt-BR": ptBR,
};

/** 今の表示言語の文言（React の外から使う。言語を変えても描き直されないので、表示は useWebMessages で行う） */
export function webMessages(): WebMessages {
  return WEB_MESSAGES[getLocale()];
}

export function useWebMessages(): WebMessages {
  return useMessages(WEB_MESSAGES);
}
