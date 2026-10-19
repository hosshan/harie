import { readFileSync } from "node:fs";
import { readHarie, writeHarie } from "@harie/format";
import { createDocument } from "@harie/model";
import { expect, test } from "@playwright/test";
import { nodeRenderer } from "../../../packages/render/src/test-utils/node-renderer";

const FIXTURES = new URL("../../../packages/format/fixtures/", import.meta.url);
const fixture = (name: string) => readFileSync(new URL(name, FIXTURES));

test("FR-EDIT-10: 注釈を残したまま画像を差し替え、大きさが違えば注釈を比率で合わせて保存する", async ({
  page,
}) => {
  const base = new Uint8Array(fixture("base.jpg"));
  const doc = {
    ...createDocument({ width: 64, height: 40, now: new Date("2026-10-19T00:00:00Z") }),
    annotations: [{ id: "rect-1", type: "rect" as const, x: 8, y: 4, w: 16, h: 8 }],
  };
  const rendered = await (await nodeRenderer()).render({
    doc,
    base: { bytes: base, mediaType: "image/jpeg" },
    output: "jpeg",
  });
  await page.goto("/");
  await page.getByLabel("画像ファイル", { exact: true }).setInputFiles({
    name: "settings.harie.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from(writeHarie({ rendered, base, doc })),
  });
  await expect(page.locator(".harie-canvas-image rect")).toHaveCount(1);

  await page.getByLabel("差し替える画像").setInputFiles({
    name: "new-capture.jpg",
    mimeType: "image/jpeg",
    buffer: fixture("large-base.jpg"),
  });
  await expect(page.getByRole("status")).toContainText("画像を差し替えました");
  await expect(page.locator(".harie-canvas-image rect")).toHaveCount(1);
  // 差し替えても開いていたファイルのまま（上書き保存の対象）
  await expect(page.locator(".app-file-name")).toHaveText("settings.harie.jpg");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "保存" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("settings.harie.jpg");
  const read = readHarie(new Uint8Array(readFileSync(await download.path())));
  if (read.kind !== "harie") throw new Error(read.kind);
  expect(read.doc.docId).toBe(doc.docId);
  expect(read.doc.canvas).toMatchObject({ width: 520, height: 400 });
  // 64×40 → 520×400（横 8.125 倍・縦 10 倍）
  expect(read.doc.annotations[0]).toMatchObject({ x: 65, y: 40, w: 130, h: 80 });
  // 新しい画像も再エンコードせずに埋め込む（ADR-0004）
  expect(read.base.bytes).toEqual(new Uint8Array(fixture("large-base.jpg")));
});

test("FR-EDIT-10: JPEG / PNG でないファイルでは差し替えない", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("画像ファイル", { exact: true }).setInputFiles({
    name: "screen.jpg",
    mimeType: "image/jpeg",
    buffer: fixture("large-base.jpg"),
  });
  await page.getByLabel("差し替える画像").setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not an image"),
  });
  await expect(page.getByRole("status")).toContainText("JPEG か PNG の画像を選んでください");
});
