// 適用済みで、まだ保存していない個人情報のマスク（ADR-0009）。
// 保存するまでは加工前の画像をメモリにだけ持ち、選んだマスクを外せるようにする。保存した時点で捨てる
import type { HarieDocument, PiiApplied, PiiMask } from "@harie/model";
import { type BaseImage, snapRect } from "@harie/render";

export type UnsavedMask = { id: string; mask: PiiMask; record: PiiApplied };

export type UnsavedMasks = {
  /** 最初にマスクを適用する前のベース画像。保存するか、すべて外したら捨てる */
  before: BaseImage;
  /** 最初にマスクを適用する前の記録（保存済みの加工。これは外せない） */
  savedPii: HarieDocument["pii"];
  entries: UnsavedMask[];
  nextId: number;
};

/** 画像の外だけにある指示は applyMasks が記録しないので、先に除いて指示と記録を 1 対 1 にする */
export function masksInImage(
  masks: readonly PiiMask[],
  canvas: { width: number; height: number },
): PiiMask[] {
  return masks.filter((m) => snapRect(m.rect, canvas.width, canvas.height) !== null);
}

/** マスクを適用したあとの状態。指示と記録が対応しないときは、外せるものとして持たない */
export function addUnsaved(
  current: UnsavedMasks | null,
  start: { before: BaseImage; pii: HarieDocument["pii"] },
  masks: readonly PiiMask[],
  applied: readonly PiiApplied[],
): UnsavedMasks {
  const base = current ?? { before: start.before, savedPii: start.pii, entries: [], nextId: 1 };
  if (masks.length !== applied.length) return base;
  const entries = masks.map((mask, i) => ({
    id: `applied-${base.nextId + i}`,
    mask,
    record: applied[i] as PiiApplied,
  }));
  return { ...base, entries: [...base.entries, ...entries], nextId: base.nextId + masks.length };
}

/** id のマスクを外したあとの記録と、かけ直す残りのマスク */
export function removeUnsaved(
  current: UnsavedMasks,
  id: string,
): { rest: UnsavedMask[]; pii: HarieDocument["pii"] } {
  const rest = current.entries.filter((e) => e.id !== id);
  // すべて外したら、保存済みの記録（同じオブジェクト）に戻す。未保存の変更がなくなったと判定できる
  const pii =
    rest.length === 0
      ? current.savedPii
      : {
          ...current.savedPii,
          applied: [...current.savedPii.applied, ...rest.map((e) => e.record)],
        };
  return { rest, pii };
}
