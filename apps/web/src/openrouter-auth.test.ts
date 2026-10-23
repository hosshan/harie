import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { authorizationUrl, challengeFor, createPkcePair } from "./ai/openrouter-auth";

describe("OpenRouter の OAuth（PKCE、ADR-0012）", () => {
  it("code_challenge は code_verifier の SHA-256 を base64url（= なし）にしたもの", async () => {
    const verifier = "harie-test-verifier-0123456789-abcdefghijklmnopqrstuvwxyz";
    expect(await challengeFor(verifier)).toBe(
      createHash("sha256").update(verifier).digest("base64url"),
    );
  });

  it("code_verifier は毎回変わり、URL に使える文字だけで 43 文字以上", async () => {
    const a = await createPkcePair();
    const b = await createPkcePair();
    expect(a.verifier).not.toBe(b.verifier);
    expect(a.verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    expect(a.challenge).toBe(await challengeFor(a.verifier));
  });

  it("許可の画面の URL に戻り先と S256 の code_challenge を付ける", () => {
    const url = new URL(authorizationUrl("https://harie.studio/app/", "abc"));
    expect(`${url.origin}${url.pathname}`).toBe("https://openrouter.ai/auth");
    expect(url.searchParams.get("callback_url")).toBe("https://harie.studio/app/");
    expect(url.searchParams.get("code_challenge")).toBe("abc");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });
});
