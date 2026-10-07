// WebAssembly は DOM / Node のどちらの型定義にも依存せずに使うため、必要な分だけ宣言する。
// globals.d.ts と違い、Node の型を読むテスト用 tsconfig でも有効にする（@types/node は宣言しない）
declare namespace WebAssembly {
  // biome-ignore lint/suspicious/noExplicitAny: 環境ごとの Module 型を区別しない
  type Module = any;
  function compile(bytes: Uint8Array | ArrayBuffer): Promise<Module>;
}
