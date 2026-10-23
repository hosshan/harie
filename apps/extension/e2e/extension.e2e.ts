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
  const ai = editor.getByRole("region", { name: "AI" });
  await editor.getByRole("button", { name: "設定", exact: true }).click();
  const settings = editor.getByRole("dialog", { name: "設定" });
  await settings.getByLabel("API キー").fill("sk-ant-e2e-dummy");
  await settings.getByRole("button", { name: "キーを登録" }).click();
  await settings.getByRole("button", { name: "閉じる" }).click();
  await expect(ai).toContainText("キャプチャしたページの文字・要素の位置");
  await ai.getByLabel("この画像を送信してよい").check();
  await ai.getByRole("button", { name: "AI に提案してもらう" }).click();
  await expect(ai.locator(".app-ai-suggestions li")).toHaveCount(1);
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
  const ai = editor.getByRole("region", { name: "AI" });
  await ai.getByLabel("この画像を送信してよい").check();
  await ai.getByRole("button", { name: "個人情報を探す" }).click();
  const panel = editor.getByRole("region", { name: "個人情報のマスク" });
  // 画像の検出が空でも、DOM の type=email の入力欄が候補になる
  await expect(panel.getByLabel("範囲 1（メール）の隠し方")).toHaveValue("replace");
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
  const ai = editor.getByRole("region", { name: "AI" });
  await expect(ai.getByRole("button", { name: "AI に提案してもらう" })).toHaveCount(0);
  await ai.getByRole("button", { name: "ページの文字から探す" }).click();
  const panel = editor.getByRole("region", { name: "個人情報のマスク" });
  await expect(panel.getByLabel("範囲 1（メール）の隠し方")).toHaveValue("replace");
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
  ) as { permissions: string[]; host_permissions?: string[] };
  expect(manifest.permissions.sort()).toEqual(["activeTab", "downloads", "scripting"]);
  expect(manifest.host_permissions).toBeUndefined();
});
