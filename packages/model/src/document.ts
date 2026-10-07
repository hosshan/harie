import { type AnoiDocument, DocumentSchema, type PiiApplied, SCHEMA_VERSION } from "./schema";

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
}): AnoiDocument {
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
  doc: AnoiDocument,
  options: { now?: Date; keepSuggestions?: boolean } = {},
): AnoiDocument {
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
 * PII 加工の記録を追記する（ADR-0007）。ベース画像の差し替え（`@anoi/render` の `applyMasks`）と必ず組で使う。
 * 記録は種別・方法・範囲のみで、元の値やダミー文字列は持たない。
 */
export function recordPiiApplied(doc: AnoiDocument, applied: readonly PiiApplied[]): AnoiDocument {
  return { ...doc, pii: { ...doc.pii, applied: [...doc.pii.applied, ...applied] } };
}
