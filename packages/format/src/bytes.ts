export type Bytes = Uint8Array;

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const latin1 = (b: Bytes) => String.fromCharCode(...b);

export const utf8 = (s: string): Bytes => encoder.encode(s);
export const fromUtf8 = (b: Bytes): string => decoder.decode(b);
export const ascii = (s: string): Bytes => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);
export const fromAscii = (b: Bytes): string => latin1(b);

export function concat(parts: readonly Bytes[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function u16(n: number): Bytes {
  return Uint8Array.of((n >>> 8) & 0xff, n & 0xff);
}

export function u32(n: number): Bytes {
  return Uint8Array.of((n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
}

/** 範囲外を読んだら例外。呼び出し側（読み込み）で捕捉して「壊れたファイル」として扱う。 */
export function readU16(b: Bytes, at: number): number {
  if (at + 2 > b.length) throw new RangeError("unexpected end of data");
  return ((b[at] as number) << 8) | (b[at + 1] as number);
}

export function readU32(b: Bytes, at: number): number {
  if (at + 4 > b.length) throw new RangeError("unexpected end of data");
  const [a, b1, c, d] = [b[at], b[at + 1], b[at + 2], b[at + 3]] as [
    number,
    number,
    number,
    number,
  ];
  return ((a << 24) | (b1 << 16) | (c << 8) | d) >>> 0;
}

export function startsWith(b: Bytes, prefix: Bytes, at = 0): boolean {
  if (at + prefix.length > b.length) return false;
  for (let i = 0; i < prefix.length; i++) if (b[at + i] !== prefix[i]) return false;
  return true;
}

export function toHex(b: Bytes): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export function hexToBytes(hex: string): Bytes {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
