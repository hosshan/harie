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
  expect(manifest.permissions.sort()).toEqual(["activeTab", "downloads", "scripting"]);
  expect(manifest.host_permissions).toBeUndefined();
  // ページ上の Harie 画像（FR-FILE-12, FR-FILE-13）の権限は、利用者がオンにしたときだけ求める
  expect(manifest.optional_host_permissions).toEqual([
    "https://github.com/*",
    "https://*.githubusercontent.com/*",
    "<all_urls>",
  ]);
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
