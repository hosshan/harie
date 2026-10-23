import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const fixture = readFileSync(
  new URL("../../../packages/format/fixtures/large-base.jpg", import.meta.url),
);
const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "POST, OPTIONS",
};

test("FR-AI-05, ADR-0012: OpenRouter で接続すると、キーを貼らずに AI の提案を使え、編集中の画像はそのまま", async ({
  page,
  context,
}) => {
  // 許可の画面: 戻り先に code を付けて戻す
  let callback: string | null = null;
  let challenge: string | null = null;
  await context.route("https://openrouter.ai/auth?**", async (route) => {
    const url = new URL(route.request().url());
    callback = url.searchParams.get("callback_url");
    challenge = url.searchParams.get("code_challenge");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    await route.fulfill({ status: 302, headers: { location: `${callback}?code=e2e-code` } });
  });
  // code をキーに換える
  const exchanges: Record<string, unknown>[] = [];
  await context.route("https://openrouter.ai/api/v1/auth/keys", async (route) => {
    if (route.request().method() === "OPTIONS")
      return route.fulfill({ status: 204, headers: cors });
    exchanges.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: cors,
      body: JSON.stringify({ key: "sk-or-e2e-dummy", user_id: null }),
    });
  });
  // 提案
  const completions: { headers: Record<string, string>; body: Record<string, unknown> }[] = [];
  await context.route("https://openrouter.ai/api/v1/chat/completions", async (route) => {
    if (route.request().method() === "OPTIONS")
      return route.fulfill({ status: 204, headers: cors });
    completions.push({ headers: route.request().headers(), body: route.request().postDataJSON() });
    const output = {
      suggestions: [
        {
          target: { x: 40, y: 40, width: 120, height: 40 },
          elementIndex: null,
          text: "ここを押します",
        },
      ],
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: cors,
      body: JSON.stringify({
        id: "gen-e2e",
        choices: [
          {
            finish_reason: "stop",
            message: { role: "assistant", content: JSON.stringify(output) },
          },
        ],
      }),
    });
  });

  await page.goto("/");
  await page
    .getByLabel("画像ファイル")
    .setInputFiles({ name: "large-base.jpg", mimeType: "image/jpeg", buffer: fixture });
  await expect(page.getByRole("application", { name: "注釈の編集面" })).toBeVisible();

  const ai = page.getByRole("region", { name: "AI" });
  await ai.getByRole("button", { name: "設定を開く" }).click();
  const settings = page.getByRole("dialog", { name: "設定" });
  const [popup] = await Promise.all([
    page.waitForEvent("popup"),
    settings.getByRole("button", { name: "OpenRouter で接続" }).click(),
  ]);
  // 許可が終わると、戻ってきたウィンドウは閉じ、元のウィンドウが接続済みになる
  await popup.waitForEvent("close");
  await expect(settings).toContainText("OpenRouter で接続済みです");
  expect(callback).toBe("http://localhost:4173/");
  expect(exchanges).toHaveLength(1);
  expect(exchanges[0]).toMatchObject({ code: "e2e-code", code_challenge_method: "S256" });
  // 送った code_verifier は、許可の画面に渡した code_challenge と対になっている
  const verifier = String(exchanges[0]?.code_verifier);
  const expected = await page.evaluate(async (v) => {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v));
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }, verifier);
  expect(challenge).toBe(expected);
  // 使い終わった code_verifier は残さない
  expect(await page.evaluate(() => localStorage.getItem("harie.openrouterVerifier"))).toBeNull();
  await settings.getByRole("button", { name: "閉じる" }).click();

  // 編集中の画像はそのままで、送信先の案内は OpenRouter 経由になる
  await expect(page.getByRole("application", { name: "注釈の編集面" })).toBeVisible();
  await expect(ai).toContainText("OpenRouter 経由で Anthropic の Claude に送信します");
  await ai.getByLabel("この画像を送信してよい").check();
  await ai.getByRole("button", { name: "AI に提案してもらう" }).click();
  await expect(ai.locator(".app-ai-suggestions li")).toHaveCount(1);
  expect(completions).toHaveLength(1);
  expect(completions[0]?.headers.authorization).toBe("Bearer sk-or-e2e-dummy");

  // 接続を解除すると、キーを消す
  await page.getByRole("banner").getByRole("button", { name: "設定" }).click();
  const headerSettings = page.getByRole("dialog", { name: "設定" });
  await headerSettings.getByRole("button", { name: "接続を解除" }).click();
  await expect(headerSettings.getByRole("button", { name: "OpenRouter で接続" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("harie.openrouterApiKey"))).toBeNull();
});
