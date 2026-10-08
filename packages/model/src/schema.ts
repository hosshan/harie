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

export const StyleSchema = z.looseObject({
  stroke: color.optional(),
  strokeWidth: nonNegative.optional(),
  fill: color.optional(),
  radius: nonNegative.optional(),
  opacity: finite.min(0).max(1).optional(),
  color: color.optional(),
  fontSize: finite.positive().optional(),
  fontWeight: z.enum(["normal", "bold"]).optional(),
  head: z.enum(["end", "both", "none"]).optional(),
});
export type Style = z.infer<typeof StyleSchema>;

// 新しいバージョンで追加されたフィールドを古いアプリが保存時に消さないよう、loose にする
const base = {
  id: z.string().min(1).max(64),
  /** AI 提案中の注釈。採用するとフラグを外す。 */
  status: z.literal("suggested").optional(),
  style: StyleSchema.optional(),
};

const boxed = { ...base, x: finite, y: finite, w: nonNegative, h: nonNegative };

export const RectAnnotationSchema = z.looseObject({ ...boxed, type: z.literal("rect") });
export const EllipseAnnotationSchema = z.looseObject({ ...boxed, type: z.literal("ellipse") });
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
});
export const CalloutAnnotationSchema = z.looseObject({
  ...base,
  type: z.literal("callout"),
  x: finite,
  y: finite,
  w: finite.positive(),
  text: z.string(),
  anchor: z
    .object({
      annotationId: z.string(),
      side: z.enum(["top", "right", "bottom", "left"]),
    })
    .optional(),
});
export const BadgeAnnotationSchema = z.looseObject({
  ...base,
  type: z.literal("badge"),
  x: finite,
  y: finite,
  number: z.int().positive(),
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

export const AnnotationSchema = z.discriminatedUnion("type", [
  RectAnnotationSchema,
  EllipseAnnotationSchema,
  ArrowAnnotationSchema,
  TextAnnotationSchema,
  CalloutAnnotationSchema,
  BadgeAnnotationSchema,
  SpotlightAnnotationSchema,
  BlurAnnotationSchema,
]);
export type Annotation = z.infer<typeof AnnotationSchema>;
export type AnnotationType = Annotation["type"];

export const PiiKindSchema = z.enum(["name", "email", "phone", "address", "id", "face", "other"]);
export const PiiMethodSchema = z.enum(["replace", "fill", "mosaic", "blur"]);

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
  canvas: z.object({
    width: z.int().positive(),
    height: z.int().positive(),
    devicePixelRatio: finite.positive().default(1),
    crop: RectSchema.nullable().default(null),
  }),
  theme: z.looseObject({ preset: z.string().default("default") }).default({ preset: "default" }),
  annotations: z.array(AnnotationSchema).default([]),
  pii: z.object({ applied: z.array(PiiAppliedSchema).default([]) }).default({ applied: [] }),
  context: z.looseObject({ intent: z.string().optional() }).optional(),
});
export type HarieDocument = z.infer<typeof DocumentSchema>;
