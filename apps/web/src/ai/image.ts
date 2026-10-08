// AI に送る画像を用意する。長辺を MAX_IMAGE_EDGE に縮める（大きい画像は API 側でも縮められ、座標がずれるため）
import { fitWithin, type ImageInput, MAX_IMAGE_EDGE } from "@harie/ai";

/** API に送れる 1 枚の上限（5MB）より少し小さく抑える */
const MAX_BYTES = 4 * 1024 * 1024;

export async function prepareImage(
  base: { bytes: Uint8Array; mediaType: "image/jpeg" | "image/png" },
  canvas: { width: number; height: number },
): Promise<ImageInput> {
  const fit = fitWithin(canvas.width, canvas.height, MAX_IMAGE_EDGE);
  if (fit.scale === 1 && base.bytes.length <= MAX_BYTES) {
    return { bytes: base.bytes, mediaType: base.mediaType, ...canvas };
  }
  const bitmap = await createImageBitmap(
    new Blob([base.bytes as Uint8Array<ArrayBuffer>], { type: base.mediaType }),
  );
  try {
    const target = new OffscreenCanvas(fit.width, fit.height);
    const ctx = target.getContext("2d");
    if (ctx === null) throw new Error("画像を縮小できませんでした");
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, fit.width, fit.height);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, fit.width, fit.height);
    const blob = await target.convertToBlob({ type: "image/jpeg", quality: 0.9 });
    return {
      bytes: new Uint8Array(await blob.arrayBuffer()),
      mediaType: "image/jpeg",
      width: fit.width,
      height: fit.height,
    };
  } finally {
    bitmap.close();
  }
}
