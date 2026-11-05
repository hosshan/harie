# Chrome Web Store の掲載情報

Chrome ウェブストアに**公開**（検索に出る）で出すときに、デベロッパー ダッシュボードの各欄へ貼る文言と素材。掲載ページは https://chromewebstore.google.com/detail/harie/dgbghdgnmjcgjdmhfnmcdphkafkbefll （2026-10-23 公開）。権限を増やしたり、外部に送るデータが変わったりしたら、ここと [プライバシーポリシー](../site/src/privacy/index.html)（英語版は `../site/src/en/privacy/index.html`）を同じ PR で直す。

手順の全体（デベロッパー登録、タグから zip を作る、審査に出す）は [README の「リリース」](README.md#リリース)。画面が大きく変わったら `pnpm --filter @harie/extension store-assets` で `store-assets/` を撮り直す。

## ストアの掲載情報

| 欄 | 値 |
|---|---|
| 名前・概要 | manifest の `name`・`description`（`public/_locales/<言語>/messages.json`）がそのまま使われる |
| カテゴリ | 仕事効率化（Productivity）の「ツール」 |
| 言語 | 英語（既定）、日本語、韓国語、中国語（繁体）、中国語（簡体）、スペイン語（ラテンアメリカとスペイン）、ポルトガル語（ブラジル）。言語ごとに下の説明を貼る。スクリーンショットとタイルは日本語と英語だけ作り、ほかの言語は英語のものを使う |
| アイコン | zip の中の `icon/128.png` |
| スクリーンショット | `store-assets/screenshot-{1-capture,2-region,3-editor}.png`（日本語）と `.en.png`（英語）。1280×800。番号の順に並べる |
| プロモーション タイル（小） | `store-assets/promo-small.png`（日本語）と `promo-small.en.png`（英語）。440×280 |
| 公式 URL（ホームページ） | `https://harie.studio/`。言語ごとの欄がないので日本語版の URL のまま。LP はヘッダーの言語メニューで `/en/`・`/ko/`・`/zh-tw/`・`/zh-cn/`・`/es/`・`/pt-br/` に移れる |
| サポート URL | `https://github.com/hosshan/harie/issues` |

### 説明（日本語）

```text
表示中のページをキャプチャして、枠・矢印・番号・説明文を付けた画像を作れます。SaaS の利用ガイドや社内マニュアルの画像づくりに向けたツールです。

保存した画像はふつうの JPEG / PNG なので、どこにでも貼れます。注釈は画像の中に一緒に保存されるので、Harie で開けば、あとから何度でも枠や文字を直せます。ほかの人が作った画像も、同じように直せます。

■ できること
・キャプチャは「見えている範囲」「範囲を選ぶ」「要素を選ぶ」の 3 通り。Alt+Shift+S でも撮れます
・「空のエディタを開く」から、撮っておいた画像を貼り付けて（Ctrl+V / ⌘V）すぐ編集することもできます
・枠、矢印、番号、吹き出し、モザイクやダミーへの置き換え
・保存した画像は Web 版（https://harie.studio/app/）やデスクトップ版でも開いて直せます
・（任意）GitHub やほかのサイトに載っている Harie 画像にカーソルを当てると、説明文をその場でコピーしたり、そのまま開いて直したりできます
・AI による補足の提案と個人情報の検出（任意。自分の Anthropic API キーを登録したときだけ動きます）

■ 権限とデータについて
・ボタンかショートカットを押したタブにだけ、そのときに限ってアクセスします。インストール時に常時のサイトへのアクセス権は求めません
・GitHub やほかのサイトに載っている Harie 画像を見る・直す機能は任意です。ポップアップでオンにしたときだけ、そのサイトの画像を読む権限を求めます
・開発者のサーバーはなく、画像や操作の記録を開発者が受け取ることはありません
・AI 機能を使うときだけ、同意を確かめてから画像を Anthropic の API に直接送ります

オープンソース（MIT License）です。ソースコード: https://github.com/hosshan/harie
```

### 説明（英語）

```text
Capture the page you're viewing and add boxes, arrows, numbered badges and notes. Harie is made for the screenshots in SaaS user guides and internal manuals.

Saved images are plain JPEG / PNG files, so you can paste them anywhere. The annotations are stored inside the image, so opening it in Harie lets you fix boxes and text again and again, even on images someone else made.

■ What you can do
- Capture the visible area, a region you drag, or a single element. Alt+Shift+S captures the visible area
- Open a blank editor and paste (Ctrl+V / ⌘V) an image you already captured to annotate it right away
- Boxes, arrows, numbered badges, callouts, and masking personal data with blur or dummy text
- Open and edit saved images in the web editor (https://harie.studio/app/) or the desktop app
- (Optional) Hover a Harie image on GitHub or other sites to copy its notes right where they are, or open it and edit it
- AI annotation suggestions and personal-data detection (optional; works only with your own Anthropic API key)

■ Permissions and data
- Harie accesses only the tab where you pressed the button or shortcut, and only at that moment. No standing site access is requested at install
- Viewing and editing Harie images on GitHub and other sites is optional. Only when you turn it on in the popup does Harie ask for permission to read images on those sites
- There are no developer servers; the developer never receives your images or usage records
- Only when you use the AI features, and after you confirm, is the image sent directly to Anthropic's API

Open source (MIT License). Source code: https://github.com/hosshan/harie
```

### 説明（韓国語）

```text
보고 있는 페이지를 캡처해 박스, 화살표, 번호, 설명을 붙인 이미지를 만들 수 있습니다. SaaS 사용 가이드나 사내 매뉴얼에 들어갈 이미지를 만들기 위한 도구입니다.

저장한 이미지는 일반 JPEG / PNG라서 어디에나 붙여넣을 수 있습니다. 주석은 이미지 안에 함께 저장되므로 Harie에서 열면 나중에도 박스와 글자를 몇 번이든 고칠 수 있습니다. 다른 사람이 만든 이미지도 똑같이 고칠 수 있습니다.

■ 할 수 있는 일
- 보이는 영역, 드래그한 영역, 요소 하나를 골라 캡처할 수 있습니다. Alt+Shift+S로 보이는 영역을 캡처합니다
- 빈 편집기를 열고 이미 캡처한 이미지를 붙여넣어(Ctrl+V / ⌘V) 바로 편집할 수도 있습니다
- 박스, 화살표, 번호, 말풍선, 모자이크나 더미 값으로 개인정보 가리기
- 저장한 이미지는 웹 버전(https://harie.studio/app/)이나 데스크톱 앱에서도 열어 고칠 수 있습니다
- (선택) GitHub나 다른 사이트에 올라간 Harie 이미지에 마우스를 올리면 설명을 그 자리에서 복사하거나 바로 열어 고칠 수 있습니다
- AI가 주석을 제안하고 개인정보를 찾아 줍니다(선택. 본인의 Anthropic API 키를 등록했을 때만 동작합니다)
- 화면은 한국어로 표시되며, 한글 주석도 그대로 그려집니다

■ 권한과 데이터
- 버튼이나 단축키를 누른 탭에만, 그 순간에만 접근합니다. 설치할 때 상시 사이트 접근 권한을 요청하지 않습니다
- GitHub나 다른 사이트의 Harie 이미지를 보고 고치는 기능은 선택 사항입니다. 팝업에서 켰을 때만 해당 사이트의 이미지를 읽는 권한을 요청합니다
- 개발자 서버가 없으며, 개발자는 이미지나 사용 기록을 받지 않습니다
- AI 기능을 쓸 때만, 동의를 확인한 뒤 이미지를 Anthropic API로 직접 보냅니다

오픈 소스(MIT License)입니다. 소스 코드: https://github.com/hosshan/harie
```

### 説明（中国語・繁体）

```text
擷取正在瀏覽的頁面，加上方框、箭頭、編號和說明文字。Harie 是為 SaaS 使用指南和內部手冊的截圖而設計的工具。

存好的圖片是一般的 JPEG / PNG，貼到哪裡都行。註解會一起存在圖片裡，用 Harie 開啟就能隨時再修改方框和文字，別人做的圖片也一樣能改。

■ 可以做什麼
- 可擷取可見範圍、拖曳選取的區域，或單一元素。按 Alt+Shift+S 可擷取可見範圍
- 也可以開啟空白編輯器，貼上（Ctrl+V / ⌘V）已擷取的圖片後立即編輯
- 方框、箭頭、編號、說明框，以及用馬賽克或假資料遮蔽個人資料
- 存好的圖片也能在網頁版（https://harie.studio/app/）或桌面版開啟並修改
- （選用）把游標移到 GitHub 或其他網站上的 Harie 圖片，就能當場複製說明文字，或直接開啟修改
- AI 註解建議與個人資料偵測（選用，只有在登錄你自己的 Anthropic API 金鑰時才會運作）
- 介面以繁體中文顯示，中文註解也能正確繪製

■ 權限與資料
- 只會在你按下按鈕或快捷鍵的分頁、且只在那個當下存取。安裝時不要求常駐的網站存取權限
- 在 GitHub 和其他網站上檢視、修改 Harie 圖片的功能是選用的。只有在彈出視窗中開啟時，才會要求讀取該網站圖片的權限
- 沒有開發者的伺服器，開發者不會收到你的圖片或使用紀錄
- 只有在使用 AI 功能時，才會在你確認後把圖片直接傳送到 Anthropic 的 API

開放原始碼（MIT License）。原始碼：https://github.com/hosshan/harie
```

### 説明（中国語・簡体）

```text
截取正在浏览的页面，加上方框、箭头、编号和说明文字。Harie 是为 SaaS 使用指南和内部手册的截图而设计的工具。

保存的图片是普通的 JPEG / PNG，粘贴到哪里都可以。标注会一起保存在图片里，用 Harie 打开就能随时再修改方框和文字，别人做的图片也一样能改。

■ 功能
- 可截取可见区域、拖动选取的范围，或单个元素。按 Alt+Shift+S 可截取可见区域
- 也可以打开空白编辑器，粘贴（Ctrl+V / ⌘V）已截取的图片后立即编辑
- 方框、箭头、编号、标注框，以及用马赛克或虚拟数据遮盖个人信息
- 保存的图片也能在网页版（https://harie.studio/app/）或桌面版中打开修改
- （可选）把鼠标移到 GitHub 或其他网站上的 Harie 图片上，就能当场复制说明文字，或直接打开修改
- AI 标注建议与个人信息检测（可选，仅在登记你自己的 Anthropic API 密钥后才会工作）
- 界面以简体中文显示，中文标注也能正确绘制

■ 权限与数据
- 只访问你按下按钮或快捷键的标签页，且只在那一刻访问。安装时不申请常驻的网站访问权限
- 在 GitHub 和其他网站上查看、修改 Harie 图片的功能是可选的。只有在弹出窗口中开启后，才会申请读取该网站图片的权限
- 没有开发者服务器，开发者不会收到你的图片或使用记录
- 只有在使用 AI 功能时，才会在你确认后把图片直接发送到 Anthropic 的 API

开源（MIT License）。源代码：https://github.com/hosshan/harie
```

### 説明（スペイン語）

```text
Captura la página que estás viendo y añade recuadros, flechas, números y notas. Harie está pensado para las capturas de las guías de uso de un SaaS y los manuales internos.

Las imágenes guardadas son JPEG / PNG normales, así que puedes pegarlas donde quieras. Las anotaciones se guardan dentro de la imagen, así que al abrirla en Harie puedes corregir recuadros y textos una y otra vez, incluso en imágenes que hizo otra persona.

■ Qué puedes hacer
- Captura el área visible, una zona que arrastres o un solo elemento. Alt+Shift+S captura el área visible
- También puedes abrir el editor vacío y pegar (Ctrl+V / ⌘V) una imagen que ya capturaste para anotarla al momento
- Recuadros, flechas, números, globos de texto y ocultación de datos personales con mosaico o valores ficticios
- Abre y edita las imágenes guardadas en el editor web (https://harie.studio/app/) o en la aplicación de escritorio
- (Opcional) Pasa el cursor sobre una imagen de Harie en GitHub u otros sitios para copiar sus notas ahí mismo, o ábrela y edítala
- Sugerencias de anotaciones con IA y detección de datos personales (opcional; solo funciona con tu propia clave de API de Anthropic)
- La interfaz está en español

■ Permisos y datos
- Harie solo accede a la pestaña en la que pulsaste el botón o el atajo, y solo en ese momento. No pide acceso permanente a los sitios al instalarse
- Ver y editar imágenes de Harie en GitHub y otros sitios es opcional. Solo cuando lo activas en la ventana emergente, Harie pide permiso para leer las imágenes de esos sitios
- No hay servidores del desarrollador; el desarrollador nunca recibe tus imágenes ni tu historial de uso
- Solo cuando usas las funciones de IA, y después de que lo confirmes, la imagen se envía directamente a la API de Anthropic

Código abierto (MIT License). Código fuente: https://github.com/hosshan/harie
```

### 説明（ポルトガル語・ブラジル）

```text
Capture a página que você está vendo e adicione caixas, setas, números e notas. O Harie foi feito para as capturas de tela de guias de uso de SaaS e manuais internos.

As imagens salvas são JPEG / PNG comuns, então você pode colá-las em qualquer lugar. As anotações ficam guardadas dentro da imagem, então ao abri-la no Harie você corrige caixas e textos quantas vezes quiser, até em imagens feitas por outra pessoa.

■ O que você pode fazer
- Capture a área visível, uma região que você arrasta ou um único elemento. Alt+Shift+S captura a área visível
- Você também pode abrir o editor vazio e colar (Ctrl+V / ⌘V) uma imagem já capturada para anotá-la na hora
- Caixas, setas, números, balões e ocultação de dados pessoais com mosaico ou valores fictícios
- Abra e edite as imagens salvas no editor web (https://harie.studio/app/) ou no app para desktop
- (Opcional) Passe o cursor sobre uma imagem do Harie no GitHub ou em outros sites para copiar as notas ali mesmo, ou abra e edite
- Sugestões de anotações com IA e detecção de dados pessoais (opcional; só funciona com sua própria chave de API da Anthropic)
- A interface está em português

■ Permissões e dados
- O Harie só acessa a aba em que você apertou o botão ou o atalho, e só naquele momento. Nenhum acesso permanente aos sites é pedido na instalação
- Ver e editar imagens do Harie no GitHub e em outros sites é opcional. Só quando você ativa no pop-up o Harie pede permissão para ler as imagens desses sites
- Não há servidores do desenvolvedor; o desenvolvedor nunca recebe suas imagens nem seu histórico de uso
- Só quando você usa os recursos de IA, e depois de confirmar, a imagem é enviada diretamente para a API da Anthropic

Código aberto (MIT License). Código-fonte: https://github.com/hosshan/harie
```

## プライバシーへの取り組み（Privacy practices）

### 単一用途

```text
表示中のウェブページのスクリーンショットを撮り、枠・矢印・説明文を付けた画像（注釈を後から編集できる JPEG / PNG）を作る。
```

英語で書く場合:

```text
Capture a screenshot of the current web page and turn it into an annotated image (a JPEG / PNG whose boxes, arrows and notes stay editable later).
```

### 権限の正当性

| 権限 | 使う理由 |
|---|---|
| `activeTab` | 利用者がツールバーのボタンかショートカットを押したタブだけを、そのときに限ってキャプチャするため。常時のサイト権限は求めない。 |
| `scripting` | 押したタブに、範囲・要素を選ぶためのオーバーレイと、画面上の要素の位置と文字を読み取る処理を、その都度注入するため。読み取った情報は注釈の位置合わせと個人情報の候補探しにだけ使い、保存ファイルには含めない。 |
| `downloads` | 注釈を付けた画像を、利用者のダウンロードフォルダに保存するため。 |
| `storage` | ポップアップで選んだ「サイト上の画像ガイド」のボタンの設定（出すボタンと、ボタンを出すサイトの一覧）を、拡張の中に保存して読むため。 |
| 任意のホスト権限（`optional_host_permissions`: `<all_urls>`） | インストール時には求めない。利用者がポップアップで「画像に編集ボタンを表示」「画像に文章のコピーボタンを表示」をオンにしたときだけ求める。画像は CDN など別のドメインから届くことが多く、それを読むために全サイトが対象になる。ボタンは利用者が指定したサイト（指定がなければすべて）でだけ出し、ページ上の Harie 画像（注釈を埋め込んだ JPEG / PNG）を見つけ、画像を読んで説明文をコピーできるようにしたり、拡張のエディタで開いたりするため。読んだ画像は端末の外に送らない。 |

英語で書く場合:

| Permission | Justification |
|---|---|
| `activeTab` | To capture only the tab where the user pressed the toolbar button or keyboard shortcut, and only at that moment. No persistent host permissions are requested. |
| `scripting` | To inject, on demand into that tab, the overlay for choosing a region or element and a function that reads element positions and text. This information is used only to align annotations and to find personal-data candidates, and is never written into saved files. |
| `downloads` | To save the annotated image to the user's downloads folder. |
| `storage` | To store, inside the extension, the popup settings for buttons on Harie images (which buttons to show and on which sites). |
| Optional host permissions (`optional_host_permissions`: `<all_urls>`) | Not requested at install. Requested only when the user turns on "Show an edit button on images" or "Show copy buttons for text on images" in the popup. It covers all sites because images are often served from other domains such as CDNs. Buttons appear only on the sites the user lists (all sites if none), where the extension finds Harie images (JPEG / PNG files with embedded annotations) and reads them so the user can copy their notes or open them in the extension's editor. Images read this way never leave the device. |

### リモートコード

「いいえ、リモートコードは使用していません」を選ぶ。拡張のコードはすべて zip に入っている。CSP の `'wasm-unsafe-eval'` は、同梱した描画エンジン（WASM）をコンパイルするためのもの。

### データの使用

- 収集するデータの種類: **ウェブサイトのコンテンツ**（Website content）だけにチェックする。AI 機能を使うとき、キャプチャ画像とページ要素の位置・文字の一覧を、利用者の API キーで Anthropic の API に送るため。
- ほかの種類（個人を特定できる情報、健康、金融、認証情報、個人的な通信、位置情報、ウェブ履歴、ユーザーのアクティビティ）にはチェックしない。API キーは利用者自身のもので、拡張の中にだけ保存し、開発者には送らない。
- 3 つの宣誓（承認された用途以外で第三者に販売・転送しない、単一用途と関係のない目的に使わない、信用度の判定や融資に使わない）にすべてチェックする。

### プライバシーポリシーの URL

`https://harie.studio/privacy/`（英語版は `https://harie.studio/en/privacy/`）

## データの扱い（プライバシーポリシーの元）

- キャプチャした画像とページの情報は、利用者の端末の中（拡張の IndexedDB）にだけ置き、24 時間より古いものは次のキャプチャのときに消す。
- AI 機能（任意）を使うときだけ、利用者が登録した Anthropic の API キーで、画像とページの要素の一覧を Anthropic の Claude API に送る。送る前に送信先を表示し、利用者の同意を求める。
- API キーは拡張の中の localStorage にだけ保存し、ほかに送らない。
- 開発者のサーバーには何も送らない。解析・広告のための収集はしない。
- （任意の機能）利用者がオンにしたサイトでは、ページ上の Harie 画像を読み、説明文のコピーとエディタで開くことにだけ使う。読んだ画像は端末の外に送らない。
