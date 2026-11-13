// 注釈ドキュメントのスキーマ（docs/03-design/document-model.md）
// 正となる定義はこのファイル。設計書は意図の説明。
import { z } from "zod";

export const SCHEMA_VERSION = "0.1";

const finite = z.number().finite();
const nonNegative = finite.nonnegative();

export const PointSchema = z.object({ x: finite, y: finite });
export type Point = z.infer<typeof PointSchema>;

export const RectSchema = z.object({ x: finite, y: finite, w: nonNegative, h: nonNegative });
export type Rect = z.infer<typeof RectSchema>;

const color = z.string().regex(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/, "#RRGGBB または #RRGGBBAA");

export const LineDashSchema = z.enum(["solid", "dashed", "dotted"]);
export type LineDash = z.infer<typeof LineDashSchema>;

export const ArrowHeadSchema = z.enum(["end", "start", "both", "none"]);
export type ArrowHead = z.infer<typeof ArrowHeadSchema>;

/** 矢じりの位置を、始端（from）・終端（to）それぞれに付くかに分ける。省略は終端だけ */
export function arrowEnds(head: ArrowHead | undefined): { start: boolean; end: boolean } {
  const h = head ?? "end";
  return { start: h === "start" || h === "both", end: h === "end" || h === "both" };
}

/** 始端・終端それぞれの矢じりの有無から、`style.head` の値を作る */
export function arrowHeadOf(ends: { start: boolean; end: boolean }): ArrowHead {
  if (ends.start && ends.end) return "both";
  if (ends.start) return "start";
  return ends.end ? "end" : "none";
}

// id は JSON Schema に変換したとき（MCP のツール定義など）に $ref で共有し、定義を繰り返さないため
export const StyleSchema = z
  .looseObject({
    stroke: color.optional(),
    strokeWidth: nonNegative.optional(),
    fill: color.optional(),
    radius: nonNegative.optional(),
    opacity: finite.min(0).max(1).optional(),
    color: color.optional(),
    fontSize: finite.positive().optional(),
    fontWeight: z.enum(["normal", "bold"]).optional(),
    /** 矢印の矢じりの位置（FR-EDIT-19）。`start` は from 側、`end` は to 側。省略は `end` */
    head: ArrowHeadSchema.optional(),
    /** 線の種類（四角・楕円・矢印）。省略は実線 */
    dash: LineDashSchema.optional(),
  })
  .meta({ id: "HarieStyle" });
export type Style = z.infer<typeof StyleSchema>;

// 新しいバージョンで追加されたフィールドを古いアプリが保存時に消さないよう、loose にする
const base = {
  id: z.string().min(1).max(64),
  /** AI 提案中の注釈。採用するとフラグを外す。 */
  status: z.literal("suggested").optional(),
  style: StyleSchema.optional(),
};

const boxed = { ...base, x: finite, y: finite, w: nonNegative, h: nonNegative };

/**
 * 回転の角度（度、時計回り）。注釈の範囲の中心を軸に回す（FR-EDIT-21 / ADR-0015）。省略は 0。
 * x, y, w（, h）は回転する前の位置と大きさのまま持つ
 */
const rotation = finite.optional();

/** 回転できる注釈の種類（ADR-0015）。矢印は端点で向きを変えるので含めない */
export const ROTATABLE_TYPES = ["rect", "ellipse", "text", "callout"] as const;
export type RotatableType = (typeof ROTATABLE_TYPES)[number];

export const RectAnnotationSchema = z.looseObject({ ...boxed, rotation, type: z.literal("rect") });
export const EllipseAnnotationSchema = z.looseObject({
  ...boxed,
  rotation,
  type: z.literal("ellipse"),
});
export const ArrowAnnotationSchema = z.looseObject({
  ...base,
  type: z.literal("arrow"),
  from: PointSchema,
  to: PointSchema,
});
export const TextAnnotationSchema = z.looseObject({
  ...base,
  type: z.literal("text"),
  x: finite,
  y: finite,
  text: z.string(),
  rotation,
});
export const CalloutAnnotationSchema = z.looseObject({
  ...base,
  type: z.literal("callout"),
  x: finite,
  y: finite,
  w: finite.positive(),
  text: z.string(),
  rotation,
  anchor: z
    .object({
      annotationId: z.string(),
      side: z.enum(["top", "right", "bottom", "left"]),
    })
    .optional(),
});
/**
 * 番号付きの丸。`anchor` で枠などに紐付けると、描画時に紐付け先の左上の角の外側へ置く（ADR-0011）。
 * `x, y` は紐付け先がないときの位置で、紐付けている場合も計算した位置を保存しておく（古い版向け）。
 */
export const BadgeAnnotationSchema = z.looseObject({
  ...base,
  type: z.literal("badge"),
  x: finite,
  y: finite,
  number: z.int().positive(),
  anchor: z.object({ annotationId: z.string() }).optional(),
});
export const SpotlightAnnotationSchema = z.looseObject({ ...boxed, type: z.literal("spotlight") });
/**
 * 可逆なぼかし。PII には使わない（ADR-0007）。PII 加工はベース画像の書き換えで行い、
 * `pii.applied` に記録する。
 */
export const BlurAnnotationSchema = z.looseObject({
  ...boxed,
  type: z.literal("blur"),
  method: z.enum(["blur", "mosaic"]),
});

export const AnnotationSchema = z
  .discriminatedUnion("type", [
    RectAnnotationSchema,
    EllipseAnnotationSchema,
    ArrowAnnotationSchema,
    TextAnnotationSchema,
    CalloutAnnotationSchema,
    BadgeAnnotationSchema,
    SpotlightAnnotationSchema,
    BlurAnnotationSchema,
  ])
  .meta({ id: "HarieAnnotation" });
export type Annotation = z.infer<typeof AnnotationSchema>;
export type AnnotationType = Annotation["type"];

/** 注釈の回転の角度（度）。回転できない種類・省略・0 は 0。-180 より大きく 180 以下にそろえる */
export function rotationOf(a: Annotation): number {
  if (!(ROTATABLE_TYPES as readonly string[]).includes(a.type)) return 0;
  return normalizeRotation((a as { rotation?: number }).rotation ?? 0);
}

/** 角度を -180 より大きく 180 以下にそろえる（-0 は 0） */
export function normalizeRotation(deg: number): number {
  const r = ((((deg + 180) % 360) + 360) % 360) - 180;
  const v = r === -180 ? 180 : r;
  return v === 0 ? 0 : v;
}

export const PiiKindSchema = z.enum(["name", "email", "phone", "address", "id", "face", "other"]);
export const PiiMethodSchema = z.enum(["replace", "fill", "mosaic", "blur"]);
export type PiiKind = z.infer<typeof PiiKindSchema>;
export type PiiMethod = z.infer<typeof PiiMethodSchema>;

/** PII 加工の記録。元の値は持たない（ADR-0007）。 */
export const PiiAppliedSchema = z.object({
  kind: PiiKindSchema,
  method: PiiMethodSchema,
  rect: RectSchema,
});

export type PiiApplied = z.infer<typeof PiiAppliedSchema>;

/**
 * PII 加工の指示（エディタ・MCP・AI の検出結果から作る）。`replacement` はダミー置換の文字列で、
 * ドキュメントには残さない（記録は `PiiApplied` の種別・方法・範囲だけ）。
 */
export const PiiMaskSchema = z.object({
  kind: PiiKindSchema,
  method: PiiMethodSchema,
  rect: RectSchema,
  replacement: z.string().max(200).optional(),
  color: color.optional(),
});
export type PiiMask = z.infer<typeof PiiMaskSchema>;

const isoDateTime = z.iso.datetime({ offset: true });

/** 書き出しの一辺の上限（ピクセル）。拡大しすぎてメモリを使い切らないようにする */
export const MAX_OUTPUT_SIDE = 8192;

export const OutputSizeSchema = z.object({
  width: z.int().positive().max(MAX_OUTPUT_SIDE),
  height: z.int().positive().max(MAX_OUTPUT_SIDE),
});
export type OutputSize = z.infer<typeof OutputSizeSchema>;

export const DocumentSchema = z.looseObject({
  schemaVersion: z.literal(SCHEMA_VERSION),
  docId: z.uuid(),
  revision: z.int().nonnegative(),
  meta: z.looseObject({
    title: z.string().optional(),
    service: z.string().optional(),
    source: z
      .looseObject({
        kind: z.enum(["chrome-extension", "file", "clipboard", "desktop", "mcp"]),
        url: z.string().optional(),
        capturedAt: isoDateTime.optional(),
      })
      .optional(),
    createdAt: isoDateTime,
    updatedAt: isoDateTime,
  }),
  // 新しいバージョンで追加されたフィールドを古いアプリが保存時に消さないよう、loose にする
  canvas: z.looseObject({
    width: z.int().positive(),
    height: z.int().positive(),
    devicePixelRatio: finite.positive().default(1),
    crop: RectSchema.nullable().default(null),
    /**
     * 書き出しの大きさ（FR-EDIT-24, ADR-0017）。保存する画像だけをこの大きさで描く。
     * ベース画像と注釈の座標は変えない。省略は表示範囲（crop か画像全体）と同じ大きさ
     */
    output: OutputSizeSchema.optional(),
  }),
  theme: z.looseObject({ preset: z.string().default("default") }).default({ preset: "default" }),
  annotations: z.array(AnnotationSchema).default([]),
  pii: z.object({ applied: z.array(PiiAppliedSchema).default([]) }).default({ applied: [] }),
  context: z.looseObject({ intent: z.string().optional() }).optional(),
});
export type HarieDocument = z.infer<typeof DocumentSchema>;
