// 共有メニューから送られた画像を受け取る（FR-CAP-09）。vite-plugin-pwa が作る Service Worker に importScripts で読み込む。
// manifest の share_target は POST で届くので、画像をキャッシュに預けてからエディタ（?shared）へ移動させる。
// キャッシュ名・キー・URL の印は src/pwa.ts と合わせる
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "POST" || !url.pathname.endsWith("/share-target")) return;
  event.respondWith(
    (async () => {
      const app = new URL("./", self.registration.scope);
      try {
        const data = await event.request.formData();
        const file = data
          .getAll("image")
          // 形式は開くときに中身で確かめる（JPEG / PNG 以外は変換する。FR-FILE-15）
          .find((f) => typeof f !== "string" && (f.type === "" || f.type.startsWith("image/")));
        if (file !== undefined) {
          const cache = await caches.open("harie-share-target");
          await cache.put(
            "shared-image",
            new Response(file, {
              headers: {
                "content-type": file.type,
                "x-harie-file-name": encodeURIComponent(file.name),
              },
            }),
          );
          app.searchParams.set("shared", "");
        }
      } catch {
        // 読めない共有は捨てて、空のエディタを開く
      }
      return Response.redirect(app.href, 303);
    })(),
  );
});
