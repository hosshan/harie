import { DocumentSchema, type HarieDocument, type PiiApplied, SCHEMA_VERSION } from "./schema";

// Web Crypto はブラウザと Node 22 の両方にグローバルで存在する。DOM 型に依存しないよう最小限だけ宣言する
declare const crypto: { randomUUID(): string };

export function newDocId(): string {
  return crypto.randomUUID();
}

export function createDocument(options: {
  width: number;
  height: number;
  devicePixelRatio?: number;
  title?: string;
  now?: Date;
  docId?: string;
}): HarieDocument {
  const now = (options.now ?? new Date()).toISOString();
  return DocumentSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    docId: options.docId ?? newDocId(),
    revision: 0,
    meta: {
      ...(options.title === undefined ? {} : { title: options.title }),
      createdAt: now,
      updatedAt: now,
    },
    canvas: {
      width: options.width,
      height: options.height,
      devicePixelRatio: options.devicePixelRatio ?? 1,
      crop: null,
    },
    annotations: [],
  });
}

/** 保存直前に呼ぶ。リビジョンを進め、更新日時を記録し、未採用の AI 提案を除く。 */
export function prepareForSave(
  doc: HarieDocument,
  options: { now?: Date; keepSuggestions?: boolean } = {},
): HarieDocument {
  return {
    ...doc,
    revision: doc.revision + 1,
    meta: { ...doc.meta, updatedAt: (options.now ?? new Date()).toISOString() },
    annotations: options.keepSuggestions
      ? doc.annotations
      : doc.annotations.filter((a) => a.status !== "suggested"),
  };
}

/**
 * PII 加工の記録を追記する（ADR-0007）。ベース画像の差し替え（`@harie/render` の `applyMasks`）と必ず組で使う。
 * 記録は種別・方法・範囲のみで、元の値やダミー文字列は持たない。
 */
export function recordPiiApplied(
  doc: HarieDocument,
  applied: readonly PiiApplied[],
): HarieDocument {
  return { ...doc, pii: { ...doc.pii, applied: [...doc.pii.applied, ...applied] } };
}

/** 表示範囲（トリミングしていればその範囲、なければ画像全体）の大きさ */
export function viewSize(doc: HarieDocument): { width: number; height: number } {
  const { width, height, crop } = doc.canvas;
  return crop === null ? { width, height } : { width: crop.w, height: crop.h };
}

/**
 * 保存する画像の大きさ（FR-EDIT-24）。書き出しの大きさを決めていなければ表示範囲と同じ。
 * 決めた大きさが表示範囲と縦横比が違えば、縦横それぞれの比率で伸び縮みさせて描く
 */
export function outputSize(doc: HarieDocument): { width: number; height: number } {
  const output = doc.canvas.output;
  if (output !== undefined) return { width: output.width, height: output.height };
  const view = viewSize(doc);
  return {
    width: Math.max(1, Math.round(view.width)),
    height: Math.max(1, Math.round(view.height)),
  };
}

/**
 * 幅か高さの一方から、表示範囲の縦横比を保ったもう一方を求める（書き出しの大きさの入力で使う）
 */
export function keepAspect(
  doc: HarieDocument,
  given: { width: number } | { height: number },
): { width: number; height: number } {
  const view = viewSize(doc);
  if ("width" in given) {
    return {
      width: given.width,
      height: Math.max(1, Math.round((given.width * view.height) / view.width)),
    };
  }
  return {
    width: Math.max(1, Math.round((given.height * view.width) / view.height)),
    height: given.height,
  };
}
