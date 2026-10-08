// XMP 記述子（docs/03-design/harie-format-spec.md §3）
export const HARIE_XMP_NS = "https://harie.app/ns/1.0/";

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
<rdf:Description rdf:about="" xmlns:harie="${HARIE_XMP_NS}" harie:formatVersion="${d.formatVersion}" harie:docId="${d.docId}" harie:revision="${d.revision}" harie:payloadSha256="${d.payloadSha256}" harie:renderSha256="${d.renderSha256}"/>
</rdf:RDF></x:xmpmeta>
<?xpacket end="w"?>`;
}

/**
 * XMP パケットから Harie 記述子を取り出す。Harie 名前空間がなければ null。
 * 他ツールが同じパケットに書いた値は無視する。属性形式のみ対応（Harie が書く形式）。
 */
export function parseXmp(xmp: string): Descriptor | null {
  if (!xmp.includes(HARIE_XMP_NS)) return null;
  const attr = (name: string) => new RegExp(`harie:${name}="([^"]*)"`).exec(xmp)?.[1];
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
