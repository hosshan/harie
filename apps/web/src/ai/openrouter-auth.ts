// OpenRouter の OAuth（PKCE）での接続（ADR-0012）。サーバーを持たずに、ブラウザだけで利用者のキーを発行してもらう。
// 編集中の画像を失わないよう、許可の画面は別のウィンドウで開く。戻ってきたウィンドウ（同じ Harie のページ）が
// キーに換えて localStorage に置き、元のウィンドウは storage イベントで受け取る（api-key.ts）
import { z } from "zod";
import { storeCredential } from "./api-key";

const AUTH_URL = "https://openrouter.ai/auth";
const EXCHANGE_URL = "https://openrouter.ai/api/v1/auth/keys";
/** 許可の画面から戻るまでの間だけ置く code_verifier。別のウィンドウで受け取るので localStorage に置く */
const VERIFIER_KEY = "harie.openrouterVerifier";

/**
 * このページで OpenRouter に接続できるか。戻り先に https（開発中は http）のページが要るので、
 * Chrome 拡張（chrome-extension:）とデスクトップ（Tauri）では出さない
 */
export function canConnectOpenRouter(): boolean {
  if (typeof window === "undefined") return false;
  if ("__TAURI_INTERNALS__" in window) return false;
  return window.location.protocol === "https:" || window.location.protocol === "http:";
}

function base64Url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** PKCE の code_verifier と、その SHA-256 の code_challenge（RFC 7636、S256） */
export async function createPkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  return { verifier, challenge: await challengeFor(verifier) };
}

export async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

/** 戻り先。今のページ（クエリを除く）に code が付いて戻ってくる */
function callbackUrl(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

export function authorizationUrl(callback: string, challenge: string): string {
  const url = new URL(AUTH_URL);
  url.searchParams.set("callback_url", callback);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

/**
 * 許可の画面を別のウィンドウで開く。ポップアップを止められていたら false。
 * window.open はクリックの中で同期的に呼ばないと止められるので、先に空のウィンドウを開いてから行き先を入れる
 */
export async function connectOpenRouter(): Promise<boolean> {
  const popup = window.open("", "harie-openrouter", "popup,width=520,height=720");
  if (popup === null) return false;
  const { verifier, challenge } = await createPkcePair();
  try {
    localStorage.setItem(VERIFIER_KEY, verifier);
  } catch {
    popup.close();
    return false;
  }
  popup.location.href = authorizationUrl(callbackUrl(), challenge);
  return true;
}

/** OpenRouter から戻ってきたページなら、その code。接続を始めていない（verifier がない）なら null */
export function openRouterCallbackCode(href: string): string | null {
  const code = new URL(href).searchParams.get("code");
  if (code === null || code === "") return null;
  try {
    return localStorage.getItem(VERIFIER_KEY) === null ? null : code;
  } catch {
    return null;
  }
}

/** 発行されたキーの応答。外部入力なので形を確かめてから使う */
const ExchangeResponseSchema = z.object({ key: z.string().min(1) });

/** code をキーに換えて登録する。失敗したら false（理由はキーを含みうるので出さない） */
export async function completeOpenRouterAuth(
  code: string,
  doFetch: typeof fetch = fetch,
): Promise<boolean> {
  let verifier: string | null = null;
  try {
    verifier = localStorage.getItem(VERIFIER_KEY);
    localStorage.removeItem(VERIFIER_KEY);
  } catch {
    return false;
  }
  if (verifier === null) return false;
  try {
    const response = await doFetch(EXCHANGE_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: "S256" }),
    });
    if (!response.ok) return false;
    const parsed = ExchangeResponseSchema.safeParse(await response.json());
    if (!parsed.success) return false;
    storeCredential({ provider: "openrouter", key: parsed.data.key });
    return true;
  } catch {
    return false;
  }
}
