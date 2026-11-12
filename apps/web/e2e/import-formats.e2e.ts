// JPEG / PNG 以外の画像を開く（FR-FILE-15, ADR-0016）。取り込むときに一度だけ JPEG / PNG に変換し、保存形式は増やさない
import { readFileSync } from "node:fs";
import { readHarie } from "@harie/format";
import { expect, type Page, test } from "@playwright/test";

const FIXTURES = new URL("../../../packages/format/fixtures/", import.meta.url);
const fixture = (name: string) => readFileSync(new URL(name, FIXTURES));

const canvas = (page: Page) => page.getByRole("application", { name: "注釈の編集面" });

async function save(page: Page) {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "保存" }).click(),
  ]);
  const read = readHarie(new Uint8Array(readFileSync(await download.path())));
  if (read.kind !== "harie") throw new Error(read.kind);
  return { name: download.suggestedFilename(), read };
}

// Chromium は HEIC を読めないので、HEIC は libheif（WASM）で読む経路を通る
for (const [ext, mimeType, base, size] of [
  ["svg", "image/svg+xml", "image/png", { width: 1024, height: 768 }],
  ["webp", "image/webp", "image/png", { width: 64, height: 48 }],
  ["gif", "image/gif", "image/png", { width: 64, height: 48 }],
  ["bmp", "image/bmp", "image/png", { width: 64, height: 48 }],
  ["avif", "image/avif", "image/jpeg", { width: 64, height: 48 }],
  ["heic", "image/heic", "image/jpeg", { width: 64, height: 48 }],
] as const) {
  test(`FR-FILE-15: ${ext.toUpperCase()} を開いて編集し、JPEG / PNG として保存できる`, async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByLabel("画像ファイル", { exact: true }).setInputFiles({
      name: `screen.${ext}`,
      mimeType,
      buffer: fixture(`import/sample.${ext}`),
    });
    await expect(canvas(page)).toBeVisible();
    await expect(page.locator(".app-file-name")).toHaveText(`screen.${ext}`);
    const { name, read } = await save(page);
    // 変換したベース画像の形式（SVG・WebP などは PNG、写真向けの HEIC・AVIF は JPEG）が保存形式の既定になる
    expect(name).toBe(base === "image/png" ? "screen.harie.png" : "screen.harie.jpg");
    expect(read.base.mediaType).toBe(base);
    expect(read.doc.canvas).toMatchObject(size);
  });
}

test("FR-FILE-15, FR-EDIT-10: WebP の画像に差し替えられる", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("画像ファイル", { exact: true }).setInputFiles({
    name: "screen.png",
    mimeType: "image/png",
    buffer: fixture("base.png"),
  });
  await expect(canvas(page)).toBeVisible();
  await page.getByLabel("差し替える画像").setInputFiles({
    name: "new.webp",
    mimeType: "image/webp",
    buffer: fixture("import/sample.webp"),
  });
  await expect(page.getByRole("status")).toContainText("画像を差し替えました");
  const { read } = await save(page);
  expect(read.base.mediaType).toBe("image/png");
  expect(read.doc.canvas).toMatchObject({ width: 64, height: 48 });
});

test("FR-FILE-15: 読めない画像は理由を表示する", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("画像ファイル", { exact: true }).setInputFiles({
    name: "broken.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><rect"),
  });
  await expect(page.getByRole("alert")).toContainText("この SVG 画像を読み込めませんでした");
});
