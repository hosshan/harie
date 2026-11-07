// インストールした Web アプリ（PWA）としての入口（FR-FILE-14, FR-CAP-09, NFR-PLAT-06）。
// - OS の「このアプリで開く」から渡された画像（manifest の file_handlers → launchQueue）
// - スマホの共有メニューから送られた画像（manifest の share_target → Service Worker が預かる。public/share-target-sw.js）
// - ブラウザのインストールの案内（beforeinstallprompt）
import { useEffect, useRef, useState } from "react";
import type { OnImageFile } from "./Start";

/** 共有された画像を Service Worker が預けておくキャッシュとキー。public/share-target-sw.js と合わせる */
export const SHARE_CACHE = "harie-share-target";
export const SHARE_KEY = "shared-image";
/** 共有から開いたことを示す URL の印。Service Worker がここへ移動させる */
export const SHARE_PARAM = "shared";

type LaunchParams = { files: readonly FileSystemHandle[] };
type LaunchWindow = Window & {
  launchQueue?: { setConsumer: (consumer: (params: LaunchParams) => void) => void };
};

/** 共有された画像を取り出す。取り出したら消す（同じ画像を開き直さないように） */
export async function takeSharedImage(): Promise<File | null> {
  if (!("caches" in window)) return null;
  const cache = await caches.open(SHARE_CACHE);
  const res = await cache.match(SHARE_KEY);
  if (res === undefined) return null;
  await cache.delete(SHARE_KEY);
  const blob = await res.blob();
  const name = decodeURIComponent(res.headers.get("x-harie-file-name") ?? "") || "shared.png";
  return new File([blob], name, { type: blob.type });
}

/**
 * アプリとして開かれたときに渡された画像を開く。
 * OS から開いたファイルはハンドルが付くので、Harie ファイルならそのまま上書き保存できる
 */
export function useLaunchedImage(onFile: OnImageFile) {
  const latest = useRef(onFile);
  latest.current = onFile;

  useEffect(() => {
    const w = window as LaunchWindow;
    w.launchQueue?.setConsumer(async (params) => {
      const handle = params.files.find((f): f is FileSystemFileHandle => f.kind === "file");
      if (handle !== undefined) latest.current(await handle.getFile(), handle);
    });
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(SHARE_PARAM)) return;
    url.searchParams.delete(SHARE_PARAM);
    // 再読み込みや履歴で開き直さないよう、印を URL から外す
    window.history.replaceState(null, "", url);
    void takeSharedImage().then((file) => {
      if (file !== null) latest.current(file, null);
    });
  }, []);
}

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type InstallState =
  /** ブラウザがインストールの画面を出せる（Chrome・Edge など） */
  | { kind: "available"; install: () => Promise<void> }
  /** すでにアプリとして開いている */
  | { kind: "installed" }
  /** ブラウザのメニューから入れてもらう（Safari・Firefox、またはインストール済み） */
  | { kind: "manual" };

function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * ブラウザがインストールを勧められるときは、その画面を Harie の中から出せるようにする。
 * イベントは画面を開いてすぐに来るので、案内のダイアログを開く前からアプリの起動時に受けておく
 */
let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
let listening = false;

function listen() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    for (const l of listeners) l();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    for (const l of listeners) l();
  });
}

/** アプリの起動時に呼び、インストールの案内を受け取れるようにする */
export function listenInstallPrompt() {
  listen();
}

export function useInstallState(): InstallState {
  const [, setTick] = useState(0);
  useEffect(() => {
    listen();
    const l = () => setTick((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  if (isStandalone()) return { kind: "installed" };
  const event = deferred;
  if (event === null) return { kind: "manual" };
  return {
    kind: "available",
    install: async () => {
      await event.prompt();
      await event.userChoice;
      // 一度出した案内は使い回せない
      deferred = null;
      for (const l of listeners) l();
    },
  };
}
