// XMP 記述子（docs/03-design/anoi-format-spec.md §3）
export const ANOI_XMP_NS = "https://anoi.app/ns/1.0/";

export type Descriptor = {
  formatVersion: string;
  docId: string;
  revision: number;
  payloadSha256: string;
  renderSha256: string;
};

export function buildXmp(d: Descriptor): string {
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description rdf:about="" xmlns:anoi="${ANOI_XMP_NS}" anoi:formatVersion="${d.formatVersion}" anoi:docId="${d.docId}" anoi:revision="${d.revision}" anoi:payloadSha256="${d.payloadSha256}" anoi:renderSha256="${d.renderSha256}"/>
</rdf:RDF></x:xmpmeta>
<?xpacket end="w"?>`;
}

/**
 * XMP パケットから Anoi 記述子を取り出す。Anoi 名前空間がなければ null。
 * 他ツールが同じパケットに書いた値は無視する。属性形式のみ対応（Anoi が書く形式）。
 */
export function parseXmp(xmp: string): Descriptor | null {
  if (!xmp.includes(ANOI_XMP_NS)) return null;
  const attr = (name: string) => new RegExp(`anoi:${name}="([^"]*)"`).exec(xmp)?.[1];
  const formatVersion = attr("formatVersion");
  const docId = attr("docId");
  const revision = Number(attr("revision"));
  const payloadSha256 = attr("payloadSha256");
  const renderSha256 = attr("renderSha256");
  if (!formatVersion || !docId || !payloadSha256 || !renderSha256 || !Number.isInteger(revision)) {
    return null;
  }
  return { formatVersion, docId, revision, payloadSha256, renderSha256 };
}
