import { readFileSync } from "node:fs";
import { readHarie } from "@harie/format";
import { expect, startCapture, test } from "./fixtures";

const editorOpened = (context: import("@playwright/test").BrowserContext, extensionId: string) =>
  context.waitForEvent("page", (p) =>
    p.url().startsWith(`chrome-extension://${extensionId}/editor.html`),
  );

test("FR-CAP-01, 03: 見えている範囲を撮ってエディタで開き、DOM 情報を AI に渡せる", async ({
  context,
  worker,
  extensionId,
  target,
}) => {
  const opened = editorOpened(context, extensionId);
  expect(await startCapture(worker, target, "visible")).toEqual({ ok: true });
  const editor = await opened;
  await expect(editor.getByRole("application", { name: "注釈の編集面" })).toBeVisible();
  await expect(editor.locator(".app-file-name")).toHaveText(/^harie-test-\d{8}-\d{6}\.png$/);
  // 撮った画像はビューポートと同じ大きさ（deviceScaleFactor 1）
  await expect(editor.locator(".harie-canvas-overlay")).toHaveAttribute("viewBox", "0 0 800 600");

  // DOM 情報: AI に送るプロンプトに要素の一覧が入り、送信の案内にもページの情報が含まれる
  const prompts: string[] = [];
  await editor.route("https://api.anthropic.com/v1/messages*", async (route) => {
    const body = route.request().postDataJSON() as {
      messages: { content: { type: string; text?: string }[] }[];
    };
    prompts.push(body.messages[0]?.content.find((c) => c.type === "text")?.text ?? "");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({
        id: "msg_test",
        type: "message",
        role: "assistant",
        model: "claude-opus-5-5",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              suggestions: [
                {
                  target: { x: 40, y: 300, width: 160, height: 40 },
                  elementIndex: 0,
                  text: "保存します",
                },
              ],
            }),
          },
        ],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    });
  });
  await editor.getByRole("button", { name: "設定", exact: true }).click();
  const settings = editor.getByRole("dialog", { name: "設定" });
  await settings.getByLabel("API キー").fill("sk-ant-e2e-dummy");
  await settings.getByRole("button", { name: "キーを登録" }).click();
  await settings.getByRole("button", { name: "閉じる" }).click();
  await editor.getByRole("button", { name: "AI提案" }).click();
  const dialog = editor.getByRole("dialog", { name: "AIでガイドを作成" });
  await expect(dialog).toContainText("キャプチャしたページの文字・要素の位置");
  await dialog.getByLabel("この画像を送信してよい").check();
  await dialog.getByRole("button", { name: "AI に提案してもらう" }).click();
  await expect(editor.getByRole("region", { name: "AI提案" }).locator("li")).toHaveCount(1);
  expect(prompts[0]).toContain("button (40, 300, 160x40) 変更を保存");
  // 要素番号で指した提案は、要素の矩形に合わせて付く（FR-AI-03）
  await expect(editor.locator('[data-suggested="ai-box-1"]')).toHaveCount(1);
});

test("FR-PII-01: DOM の入力欄とテキストから、個人情報をマスクの候補にできる", async ({
  context,
  worker,
  extensionId,
  target,
}) => {
  const opened = editorOpened(context, extensionId);
  await startCapture(worker, target, "visible");
  const editor = await opened;
  await editor.route("https://api.anthropic.com/v1/messages*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({
        id: "msg_test",
        type: "message",
        role: "assistant",
        model: "claude-opus-5-5",
        content: [{ type: "text", text: JSON.stringify({ findings: [] }) }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    }),
  );
  await editor.evaluate(() => localStorage.setItem("harie.anthropicApiKey", "sk-ant-e2e-dummy"));
  await editor.reload();
  // 個人情報を探す操作は、個人情報を隠す道具を選んだときだけ、マスクの欄の末尾に出る
  await editor.getByRole("button", { name: "個人情報を隠す" }).click();
  const panel = editor.getByRole("region", { name: "個人情報のマスク" });
  const pii = panel.getByRole("region", { name: "個人情報を探す" });
  await pii.getByLabel("この画像を送信してよい").check();
  await pii.getByRole("button", { name: "AI で画像から探す" }).click();
  // 画像の検出が空でも、DOM の type=email の入力欄が候補になる
  await expect(
    panel
      .getByRole("group", { name: "範囲 1（メール）の隠し方" })
      .getByRole("button", { name: "ダミーの文字に置き換え" }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("FR-PII-06: API キーがなくても、DOM のテキストから個人情報をマスクの候補にでき、何も送らない", async ({
  context,
  worker,
  extensionId,
  target,
}) => {
  const opened = editorOpened(context, extensionId);
  await startCapture(worker, target, "visible");
  const editor = await opened;
  let sent = 0;
  await editor.route("https://api.anthropic.com/**", (route) => {
    sent += 1;
    return route.abort();
  });
  await expect(editor.getByRole("button", { name: "AI提案" })).toHaveCount(0);
  await expect(editor.getByRole("button", { name: "ページの文字から探す" })).toHaveCount(0);
  await editor.getByRole("button", { name: "個人情報を隠す" }).click();
  const panel = editor.getByRole("region", { name: "個人情報のマスク" });
  await panel.getByRole("button", { name: "ページの文字から探す" }).click();
  await expect(
    panel
      .getByRole("group", { name: "範囲 1（メール）の隠し方" })
      .getByRole("button", { name: "ダミーの文字に置き換え" }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(sent).toBe(0);
});

test("FR-EDIT-15: 要素で囲むでボタンを押すと、ぴったりの枠と番号・吹き出しが付き、何も送らない", async ({
  context,
  worker,
  extensionId,
  target,
}) => {
  const opened = editorOpened(context, extensionId);
  await startCapture(worker, target, "visible");
  const editor = await opened;
  let sent = 0;
  await editor.route(/^https:\/\/(api\.anthropic\.com|openrouter\.ai)\//, (route) => {
    sent += 1;
    return route.abort();
  });
  await editor.getByRole("button", { name: "要素で囲む" }).click();
  // 撮った画像は 800x600。「変更を保存」ボタン（40, 300, 160x40）の中を押す
  const box = await editor.getByRole("application", { name: "注釈の編集面" }).boundingBox();
  if (box === null) throw new Error("編集面がない");
  const k = Math.min(box.width / 800, box.height / 600);
  const at = (x: number, y: number) =>
    [
      box.x + (box.width - 800 * k) / 2 + x * k,
      box.y + (box.height - 600 * k) / 2 + y * k,
    ] as const;
  await editor.mouse.move(...at(100, 320));
  await expect(editor.locator(".harie-element-hover")).toHaveCount(1);
  await editor.mouse.click(...at(100, 320));
  const image = editor.locator(".harie-canvas-image");
  await expect(image.locator('rect[x="32"][y="292"][width="176"][height="56"]')).toHaveCount(1);
  await expect(image).toContainText("「変更を保存」を押します");
  await expect(image).toContainText("1");
  // 1 回の操作なので、元に戻すと 3 つとも消える
  await editor.getByRole("button", { name: "元に戻す" }).click();
  await expect(image).not.toContainText("「変更を保存」を押します");
  await expect(image.locator('rect[x="32"][y="292"]')).toHaveCount(0);
  expect(sent).toBe(0);
});

test("FR-CAP-02: 範囲を選んで撮ると、その範囲だけの画像になり、保存は chrome.downloads で行う", async ({
  context,
  worker,
  extensionId,
  target,
}) => {
  expect(await startCapture(worker, target, "region")).toEqual({ ok: true });
  await expect(target.getByText("撮りたい範囲をドラッグしてください")).toBeVisible();
  const opened = editorOpened(context, extensionId);
  await target.mouse.move(20, 280);
  await target.mouse.down();
  await target.mouse.move(120, 320);
  await target.mouse.move(220, 360);
  await target.mouse.up();
  const editor = await opened;
  await expect(editor.locator(".harie-canvas-overlay")).toHaveAttribute("viewBox", "0 0 200 80");
  // オーバーレイは消えている
  await expect(target.locator("[data-harie-overlay]")).toHaveCount(0);

  await editor.getByRole("button", { name: "四角" }).click();
  await editor.getByRole("button", { name: "保存", exact: true }).click();
  await expect(editor.getByRole("status")).toHaveText(
    /^harie-test-\d{8}-\d{6}\.harie\.png を保存しました$/,
  );
  // chrome.downloads で書き出したファイルを、ダウンロードの記録から探して読む（テストでは Playwright が受け取る）
  const path = await worker.evaluate(async () => {
    for (;;) {
      const [item] = await chrome.downloads.search({ orderBy: ["-startTime"], limit: 1 });
      if (item?.state === "complete") return item.filename;
      if (item?.state === "interrupted") throw new Error(item.error);
      await new Promise((r) => setTimeout(r, 100));
    }
  });
  const file = new Uint8Array(readFileSync(path));
  const read = readHarie(file);
  expect(read.kind).toBe("harie");
  if (read.kind !== "harie") return;
  expect(read.doc.canvas).toMatchObject({ width: 200, height: 80 });
  // DOM 情報（ページの文字）は保存ファイルに入らない
  expect(Buffer.from(file).includes(Buffer.from("hanako.sato@example.com"))).toBe(false);
});

test("FR-CAP-10: 範囲選択で幅×高さを入れると、クリックした位置をその大きさちょうどで撮る", async ({
  context,
  worker,
  extensionId,
  target,
}) => {
  await startCapture(worker, target, "region");
  const overlay = target.locator("[data-harie-overlay]");
  await overlay.getByRole("textbox", { name: "幅（W）" }).fill("150");
  await overlay.getByRole("textbox", { name: "高さ（H）" }).fill("60");
  await expect(overlay.getByText("クリックした位置を左上にして")).toBeVisible();
  // 画面より大きい値では撮れない
  await overlay.getByRole("textbox", { name: "幅（W）" }).fill("5000");
  await expect(overlay.getByText("画面より大きいため")).toBeVisible();
  await overlay.getByRole("textbox", { name: "幅（W）" }).fill("150");

  const opened = editorOpened(context, extensionId);
  await target.mouse.move(30, 300);
  await expect(overlay.getByText("150 × 60")).toBeVisible();
  await target.mouse.click(30, 300);
  const editor = await opened;
  await expect(editor.locator(".harie-canvas-overlay")).toHaveAttribute("viewBox", "0 0 150 60");

  // 次の範囲選択では欄は空から始まり、これまでどおりドラッグで選べる
  await startCapture(worker, target, "region");
  await expect(overlay.getByRole("textbox", { name: "幅（W）" })).toHaveValue("");
  await target.keyboard.press("Escape");
  await expect(overlay).toHaveCount(0);
});

test("FR-CAP-02: 要素を選ぶと、余白付きでその要素を撮る。Esc でやめられる", async ({
  context,
  worker,
  extensionId,
  target,
}) => {
  await startCapture(worker, target, "element");
  await target.keyboard.press("Escape");
  await expect(target.locator("[data-harie-overlay]")).toHaveCount(0);

  await startCapture(worker, target, "element");
  const opened = editorOpened(context, extensionId);
  await target.mouse.move(100, 320);
  await target.mouse.click(100, 320);
  const editor = await opened;
  // ボタン（160x40）に 8px ずつの余白
  await expect(editor.locator(".harie-canvas-overlay")).toHaveAttribute("viewBox", "0 0 176 56");
});

test("NFR-SEC-03: 常時のサイト権限を持たない（テスト用のビルドを除く）", async () => {
  const manifest = JSON.parse(
    readFileSync(new URL("../.output/chrome-mv3/manifest.json", import.meta.url), "utf8"),
  ) as { permissions: string[]; host_permissions?: string[]; optional_host_permissions?: string[] };
  expect(manifest.permissions.sort()).toEqual(["activeTab", "downloads", "scripting", "storage"]);
  expect(manifest.host_permissions).toBeUndefined();
  // ページ上の Harie 画像（FR-FILE-12, FR-FILE-13）の権限は、利用者がオンにしたときだけ求める
  expect(manifest.optional_host_permissions).toEqual(["<all_urls>"]);
});

test("FR-FILE-11: 撮った画像を保存せずにクリップボードへコピーできる", async ({
  context,
  worker,
  extensionId,
  target,
}) => {
  const opened = editorOpened(context, extensionId);
  expect(await startCapture(worker, target, "visible")).toEqual({ ok: true });
  const editor = await opened;
  await expect(editor.locator(".harie-canvas-overlay")).toHaveAttribute("viewBox", "0 0 800 600");

  // 拡張のページには clipboard-read を与えられないので、書き込めたこと（失敗の表示が出ないこと）を確かめる
  await editor.getByRole("button", { name: "コピー", exact: true }).click();
  await expect(editor.getByRole("status")).toHaveText("画像をコピーしました");
});

test("FR-CAP-08: ポップアップから空のエディタを開き、貼り付けた画像を編集できる", async ({
  context,
  extensionId,
}) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  const opened = editorOpened(context, extensionId);
  await popup.getByRole("button", { name: "空のエディタを開く" }).click();
  const editor = await opened;

  // 画像のない状態では、キャプチャが見つからない旨ではなく、貼り付けの案内を出す
  await expect(editor.getByText(/貼り付け/)).toBeVisible();
  await expect(editor.getByRole("alert")).toHaveCount(0);
  await expect(editor.getByRole("button", { name: "画像を開く" })).toBeVisible();

  // 撮った画像をクリップボードから貼り付けたときと同じイベントを送る
  await editor.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 200;
    const ctx = canvas.getContext("2d");
    if (ctx === null) throw new Error("2d がありません");
    ctx.fillStyle = "#dde3ea";
    ctx.fillRect(0, 0, 320, 200);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (blob === null) throw new Error("PNG を作れませんでした");
    const dt = new DataTransfer();
    dt.items.add(new File([blob], "", { type: "image/png" }));
    window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, cancelable: true }));
  });
  await expect(editor.locator(".app-file-name")).toHaveText("clipboard.png");
  await expect(editor.locator(".harie-canvas-overlay")).toHaveAttribute("viewBox", "0 0 320 200");
});

test("FR-FILE-15, FR-CAP-08: 空のエディタで HEIC を開ける（拡張のページでも HEIC のデコーダ（WASM）が動く）", async ({
  context,
  extensionId,
}) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  const opened = editorOpened(context, extensionId);
  await popup.getByRole("button", { name: "空のエディタを開く" }).click();
  const editor = await opened;
  await editor.getByLabel("画像ファイル", { exact: true }).setInputFiles({
    name: "photo.heic",
    mimeType: "image/heic",
    buffer: readFileSync(
      new URL("../../../packages/format/fixtures/import/sample.heic", import.meta.url),
    ),
  });
  await expect(editor.locator(".app-file-name")).toHaveText("photo.heic");
  await expect(editor.locator(".harie-canvas-overlay")).toHaveAttribute("viewBox", "0 0 64 48");
});

const badge = (worker: import("@playwright/test").Worker) =>
  worker.evaluate(() => chrome.action.getBadgeText({}));

/** エディタが開いたキャプチャの画像（IndexedDB）の 1 点の色 */
async function capturedPixel(editor: import("@playwright/test").Page, x: number, y: number) {
  return editor.evaluate(
    async ({ x, y }) => {
      const id = location.hash.slice(1);
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open("harie");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const record = await new Promise<{ image: Blob }>((resolve, reject) => {
        const req = db.transaction("captures").objectStore("captures").get(id);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const bitmap = await createImageBitmap(record.image);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext("2d");
      if (ctx === null) throw new Error("2d がありません");
      ctx.drawImage(bitmap, 0, 0);
      return [...ctx.getImageData(x, y, 1, 1).data.slice(0, 3)];
    },
    { x, y },
  );
}

/** メニューのように、操作すると出て、外を押すと消える要素をページに足す */
const openMenu = (target: import("@playwright/test").Page) =>
  target.evaluate(() => {
    const menu = document.createElement("div");
    menu.id = "menu";
    menu.setAttribute("role", "menuitem");
    menu.textContent = "メニュー";
    menu.style.cssText =
      "position:fixed;left:400px;top:100px;width:120px;height:60px;background:#f00";
    document.body.append(menu);
    document.addEventListener("mousedown", () => menu.remove(), { once: true, capture: true });
  });

test("FR-CAP-11: タイマーで撮ると、残りの秒数をアイコンに出し、待ってから見えている範囲を撮る", async ({
  context,
  worker,
  extensionId,
  target,
}) => {
  const opened = editorOpened(context, extensionId);
  const startedAt = Date.now();
  expect(await startCapture(worker, target, "visible", true)).toEqual({ ok: true });
  await expect.poll(() => badge(worker)).toMatch(/^[1-5]$/);
  // 待っている間に出したメニューが写る
  await openMenu(target);
  const editor = await opened;
  expect(Date.now() - startedAt).toBeGreaterThanOrEqual(4900);
  expect(await badge(worker)).toBe("");
  await expect(editor.locator(".harie-canvas-overlay")).toHaveAttribute("viewBox", "0 0 800 600");
  expect(await capturedPixel(editor, 450, 120)).toEqual([255, 0, 0]);
});

test("FR-CAP-11: タイマーで範囲を選ぶと、待ち終えた画面を止めて選ぶので、選ぶ操作で消えたメニューも写る", async ({
  context,
  worker,
  extensionId,
  target,
}) => {
  expect(await startCapture(worker, target, "region", true)).toEqual({ ok: true });
  await openMenu(target);
  await expect(target.getByText("撮りたい範囲をドラッグしてください")).toBeVisible({
    timeout: 8000,
  });
  const opened = editorOpened(context, extensionId);
  await target.mouse.move(380, 80);
  await target.mouse.down();
  await target.mouse.move(450, 130);
  await target.mouse.move(540, 180);
  await target.mouse.up();
  // ページのメニューは押したときに消えている
  await expect(target.locator("#menu")).toHaveCount(0);
  const editor = await opened;
  await expect(editor.locator(".harie-canvas-overlay")).toHaveAttribute("viewBox", "0 0 160 100");
  expect(await capturedPixel(editor, 70, 40)).toEqual([255, 0, 0]);
});

test("FR-CAP-11: タイマーで要素を選ぶと、止めた画面の要素の位置で選べる", async ({
  context,
  worker,
  extensionId,
  target,
}) => {
  expect(await startCapture(worker, target, "element", true)).toEqual({ ok: true });
  await openMenu(target);
  await expect(target.getByText("撮りたい要素をクリックしてください")).toBeVisible({
    timeout: 8000,
  });
  const opened = editorOpened(context, extensionId);
  await target.mouse.move(460, 130);
  await target.mouse.click(460, 130);
  const editor = await opened;
  // メニュー（120x60）に 8px ずつの余白
  await expect(editor.locator(".harie-canvas-overlay")).toHaveAttribute("viewBox", "0 0 136 76");
  expect(await capturedPixel(editor, 68, 38)).toEqual([255, 0, 0]);
});

test("FR-CAP-11: 待っている間にタブを切り替えると撮らず、アイコンの「!」で知らせる", async ({
  context,
  worker,
  target,
}) => {
  expect(await startCapture(worker, target, "visible", true)).toEqual({ ok: true });
  const other = await context.newPage();
  await other.goto("http://harie.test/other");
  await other.bringToFront();
  await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: "http://harie.test/other" });
    if (tab?.id !== undefined) await chrome.tabs.update(tab.id, { active: true });
  });
  await expect.poll(() => badge(worker), { timeout: 10000 }).toBe("!");
  expect(await worker.evaluate(() => chrome.action.getTitle({}))).toBe(
    "タブが切り替わったので撮りませんでした",
  );
  expect(context.pages().some((p) => p.url().includes("editor.html"))).toBe(false);
});

test("FR-CAP-11: ポップアップのタイマーはオン・オフだけで覚えない。数えている途中で開くと「やめる」で止められる", async ({
  context,
  worker,
  extensionId,
  target,
}) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  const timer = popup.getByRole("checkbox", { name: "5 秒待ってから撮る" });
  await expect(timer).not.toBeChecked();
  await timer.check();
  await popup.reload();
  await expect(timer).not.toBeChecked();
  await expect(popup.getByRole("button", { name: "範囲を選ぶ" })).toBeVisible();

  expect(await startCapture(worker, target, "visible", true)).toEqual({ ok: true });
  await popup.reload();
  await expect(
    popup.getByRole("status").filter({ hasText: /あと \d+ 秒で撮ります/ }),
  ).toBeVisible();
  await popup.getByRole("button", { name: "やめる" }).click();
  await expect.poll(() => badge(worker)).toBe("");
});
