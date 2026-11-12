// 紹介ページのアクセス解析（Google アナリティクス 4）。ADR-0017, NFR-SEC-06
// - 対象は紹介ページ（LP 各言語とプライバシーポリシー）だけ。Web エディタ・Chrome 拡張・デスクトップ版・MCP には入れない
// - EEA・英国・スイスからの訪問は Cookie を使わない（同意モードの analytics_storage を denied にする）。同意バナーは出さない
// - 広告の機能（Google シグナル、広告のパーソナライズ）は使わない
// - harie.studio で開いたときだけ読み込む（ローカルの確認やプレビューは数えない）

/** GA4 の測定 ID（例: G-XXXXXXXXXX）。空なら何も入れない */
export const GA_MEASUREMENT_ID = "";

/** 同意モードで Cookie を使わない地域（EEA 30 か国 + 英国 + スイス） */
const COOKIELESS_REGIONS = [
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
  "IS",
  "LI",
  "NO",
  "GB",
  "CH",
];

/** @param {string} id */
export function analyticsSnippet(id) {
  if (!/^G-[A-Z0-9]+$/.test(id)) throw new Error(`GA4 の測定 ID の形ではありません: ${id}`);
  const denied = { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" };
  const script = `
(function () {
  if (location.hostname !== "harie.studio") return;
  window.dataLayer = window.dataLayer || [];
  function gtag() { dataLayer.push(arguments); }
  gtag("consent", "default", ${JSON.stringify({ ...denied, analytics_storage: "denied", region: COOKIELESS_REGIONS })});
  gtag("consent", "default", ${JSON.stringify({ ...denied, analytics_storage: "granted" })});
  gtag("js", new Date());
  gtag("config", "${id}", { allow_google_signals: false, allow_ad_personalization_signals: false });
  // エディタを開くリンク（同じサイト内なので拡張計測の離脱クリックに入らない）を数える
  document.addEventListener("click", function (e) {
    var a = e.target instanceof Element ? e.target.closest("a[href]") : null;
    if (!a) return;
    var url = new URL(a.href, location.href);
    if (url.origin === location.origin && /^\\/app\\/?$/.test(url.pathname)) {
      gtag("event", "open_editor", { link_text: (a.textContent || "").trim().slice(0, 100) });
    }
  });
  var s = document.createElement("script");
  s.async = true;
  s.src = "https://www.googletagmanager.com/gtag/js?id=${id}";
  document.head.appendChild(s);
})();`;
  return `    <script>${script}\n    </script>`;
}
