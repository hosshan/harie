// ブラウザと Node 22 の両方にグローバルで存在する API のうち、使うものだけを宣言する。
// DOM / Node の型定義に依存しないため（CLAUDE.md の依存方向）
declare class TextEncoder {
  encode(input?: string): Uint8Array;
}
declare class TextDecoder {
  constructor(label?: string, options?: { fatal?: boolean });
  decode(input?: Uint8Array): string;
}
