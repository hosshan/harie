// 注釈の変更操作。エディタの Undo/Redo、AI の提案、MCP のツールが同じ操作を使う
// （docs/03-design/document-model.md の「操作」）
import { z } from "zod";
import { err, ok, type Result } from "./result";
import {
  type Annotation,
  AnnotationSchema,
  FrameSchema,
  type HarieDocument,
  OutputSizeSchema,
} from "./schema";

export const OpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add"), annotation: AnnotationSchema, index: z.int().optional() }),
  z.object({
    op: z.literal("update"),
    id: z.string(),
    patch: z.record(z.string(), z.unknown()),
  }),
  z.object({ op: z.literal("remove"), id: z.string() }),
  z.object({ op: z.literal("reorder"), id: z.string(), index: z.int() }),
  z.object({ op: z.literal("renumber") }),
  /** 書き出しの大きさを変える（FR-EDIT-24）。null で元の大きさに戻す。注釈の座標は変えない */
  z.object({ op: z.literal("setOutputSize"), size: OutputSizeSchema.nullable() }),
  /** 保存する画像の仕上げを置き換える（FR-FILE-16）。null で外す */
  z.object({ op: z.literal("frame"), frame: FrameSchema.nullable() }),
]);
export type Op = z.infer<typeof OpSchema>;

export type OpError = { opIndex: number; message: string };

function clampIndex(index: number, length: number): number {
  return Math.max(0, Math.min(index, length));
}

function applyOne(doc: HarieDocument, op: Op): Result<HarieDocument> {
  if (op.op === "setOutputSize") {
    const { output: _, ...canvas } = doc.canvas;
    return ok({ ...doc, canvas: op.size === null ? canvas : { ...canvas, output: op.size } });
  }
  if (op.op === "frame") {
    const { frame: _, ...rest } = doc;
    return ok(op.frame === null ? rest : { ...rest, frame: op.frame });
  }
  const result = applyToAnnotations(doc.annotations, op);
  return result.ok ? ok({ ...doc, annotations: result.value }) : result;
}

function applyToAnnotations(
  annotations: Annotation[],
  op: Exclude<Op, { op: "setOutputSize" | "frame" }>,
): Result<Annotation[]> {
  switch (op.op) {
    case "add": {
      if (annotations.some((a) => a.id === op.annotation.id)) {
        return err(`id "${op.annotation.id}" は既に存在する`);
      }
      const next = [...annotations];
      next.splice(clampIndex(op.index ?? next.length, next.length), 0, op.annotation);
      return ok(next);
    }
    case "update": {
      const i = annotations.findIndex((a) => a.id === op.id);
      const current = annotations[i];
      if (current === undefined) return err(`id "${op.id}" が見つからない`);
      if ("id" in op.patch || "type" in op.patch) return err("id と type は変更できない");
      const parsed = AnnotationSchema.safeParse({ ...current, ...op.patch });
      if (!parsed.success) return err(z.prettifyError(parsed.error));
      const next = [...annotations];
      next[i] = parsed.data;
      return ok(next);
    }
    case "remove": {
      if (!annotations.some((a) => a.id === op.id)) return err(`id "${op.id}" が見つからない`);
      return ok(annotations.filter((a) => a.id !== op.id));
    }
    case "reorder": {
      const i = annotations.findIndex((a) => a.id === op.id);
      const target = annotations[i];
      if (target === undefined) return err(`id "${op.id}" が見つからない`);
      const next = annotations.filter((a) => a.id !== op.id);
      next.splice(clampIndex(op.index, next.length), 0, target);
      return ok(next);
    }
    case "renumber": {
      let n = 0;
      return ok(annotations.map((a) => (a.type === "badge" ? { ...a, number: ++n } : a)));
    }
  }
}

/**
 * 操作列を順に適用する。1 つでも失敗したら何も適用せずにエラーを返す（原子的）。
 * 入力の ops は外部入力（MCP 引数・LLM 出力）でありうるので、ここで検証する。
 */
export function applyOps(
  doc: HarieDocument,
  ops: readonly unknown[],
): Result<HarieDocument, OpError> {
  let next = doc;
  for (const [opIndex, raw] of ops.entries()) {
    const parsed = OpSchema.safeParse(raw);
    if (!parsed.success) return err({ opIndex, message: z.prettifyError(parsed.error) });
    const result = applyOne(next, parsed.data);
    if (!result.ok) return err({ opIndex, message: result.error });
    next = result.value;
  }
  return ok(next);
}
