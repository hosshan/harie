// スキーマのマイグレーション（FR-FILE-07）
// 新しい schemaVersion を足すときは、ここに変換関数を追加し、旧バージョンのフィクスチャでテストする
import { z } from "zod";
import { err, ok, type Result } from "./result";
import { type AnoiDocument, DocumentSchema, SCHEMA_VERSION } from "./schema";

export type MigrateError =
  | { kind: "UnsupportedVersion"; version: string }
  | { kind: "Invalid"; message: string };

type Migration = (doc: Record<string, unknown>) => Record<string, unknown>;

/** キー: 変換元のバージョン。値: 1 つ新しいバージョンへの変換。 */
const MIGRATIONS: Record<string, { to: string; run: Migration }> = {};

function parseVersion(version: string): [number, number] | null {
  const m = /^(\d+)\.(\d+)$/.exec(version);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/** 同じメジャーの新しいマイナー版か（未知のフィールドを保持したまま読める）。 */
function isNewerMinor(version: string): boolean {
  const v = parseVersion(version);
  const current = parseVersion(SCHEMA_VERSION);
  return v !== null && current !== null && v[0] === current[0] && v[1] > current[1];
}

export function migrateDocument(raw: unknown): Result<AnoiDocument, MigrateError> {
  if (typeof raw !== "object" || raw === null) {
    return err({ kind: "Invalid", message: "オブジェクトではない" });
  }
  let doc = raw as Record<string, unknown>;
  let version = typeof doc.schemaVersion === "string" ? doc.schemaVersion : "";
  if (version === "") return err({ kind: "Invalid", message: "schemaVersion がない" });

  while (version !== SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (step === undefined) {
      // 同じメジャーの新しいマイナー版は、未知のフィールドを保持したまま読む
      if (isNewerMinor(version)) {
        doc = { ...doc, schemaVersion: SCHEMA_VERSION };
        break;
      }
      return err({ kind: "UnsupportedVersion", version });
    }
    doc = step.run(doc);
    version = step.to;
  }

  const parsed = DocumentSchema.safeParse(doc);
  if (!parsed.success) return err({ kind: "Invalid", message: z.prettifyError(parsed.error) });
  return ok(parsed.data);
}
