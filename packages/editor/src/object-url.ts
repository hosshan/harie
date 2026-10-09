// ベース画像を編集面に表示するための blob: URL。作成と破棄を同じ effect で行う
import { useEffect, useState } from "react";

/**
 * バイト列の blob: URL を返す（作れるまでは undefined）。バイト列が変わるか外されたら破棄する。
 * useMemo で作って effect で破棄すると、StrictMode（開発時）の effect の付け直しで
 * 使用中の URL が破棄され、編集面を描き直したときにベース画像が表示されなくなる
 */
export function useObjectUrl(bytes: Uint8Array, mediaType: string): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    const created = URL.createObjectURL(
      new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mediaType }),
    );
    setUrl(created);
    return () => {
      URL.revokeObjectURL(created);
      setUrl(undefined);
    };
  }, [bytes, mediaType]);
  return url;
}
