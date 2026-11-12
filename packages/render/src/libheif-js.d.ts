// libheif-js には型定義がないので、使う入口だけ宣言する（FR-FILE-15）
declare module "libheif-js/libheif-wasm/libheif-bundle.mjs" {
  /** 呼ぶと WASM を同梱したモジュールを返す。返り値は @harie/render の LibHeif として使う */
  const libheif: () => unknown;
  export default libheif;
}
