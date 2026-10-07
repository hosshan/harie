const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const c = (i: number) => ALPHABET.charAt(i);

/** btoa は文字列経由で遅く型も環境依存なので、バイト列から直接エンコードする。 */
export function toBase64(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const v =
      ((bytes[i] as number) << 16) | ((bytes[i + 1] as number) << 8) | (bytes[i + 2] as number);
    out += c(v >> 18) + c((v >> 12) & 63) + c((v >> 6) & 63) + c(v & 63);
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const v = (bytes[i] as number) << 16;
    out += `${c(v >> 18)}${c((v >> 12) & 63)}==`;
  } else if (rest === 2) {
    const v = ((bytes[i] as number) << 16) | ((bytes[i + 1] as number) << 8);
    out += `${c(v >> 18)}${c((v >> 12) & 63)}${c((v >> 6) & 63)}=`;
  }
  return out;
}

export function toDataUri(bytes: Uint8Array, mediaType: string): string {
  return `data:${mediaType};base64,${toBase64(bytes)}`;
}
