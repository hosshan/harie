import { readFileSync } from "node:fs";
import { readHarie, writeHarie } from "@harie/format";
import { createDocument } from "@harie/model";
import { expect, type Page, test } from "@playwright/test";
import { nodeRenderer } from "../../../packages/render/src/test-utils/node-renderer";

const FIXTURES = new URL("../../../packages/format/fixtures/", import.meta.url);
const fixture = (name: string) => readFileSync(new URL(name, FIXTURES));

async function openFixture(page: Page, name: string, mimeType = "image/jpeg") {
  await page.goto("/");
  await page.getByLabel("画像ファイル").setInputFiles({ name, mimeType, buffer: fixture(name) });
  await expect(page.getByRole("application", { name: "注釈の編集面" })).toBeVisible();
  // 開いたときに Noto Sans JP を読み込み、読み込み終わると文字の高さが変わって編集面の位置がずれる。
  // ドラッグの途中でずれないよう、読み込みを待ってから操作する
  await page.waitForFunction(
    () =>
      document.fonts.status === "loaded" &&
      [...document.fonts].every((f) => f.status !== "loading"),
  );
}

/** 編集面の上で、画像の座標（px）を画面の座標に直してドラッグする（縦横比を保った余白も考慮） */
async function drag(page: Page, from: [number, number], to: [number, number], size = [520, 400]) {
  const box = await page.getByRole("application", { name: "注釈の編集面" }).boundingBox();
  if (box === null) throw new Error("編集面がない");
  const [w, h] = size as [number, number];
  const k = Math.min(box.width / w, box.height / h);
  const ox = box.x + (box.width - w * k) / 2;
  const oy = box.y + (box.height - h * k) / 2;
  const at = (p: [number, number]) => [ox + p[0] * k, oy + p[1] * k] as const;
  await page.mouse.move(...at(from));
  await page.mouse.down();
  await page.mouse.move(...at([(from[0] + to[0]) / 2, (from[1] + to[1]) / 2]));
  await page.mouse.move(...at(to));
  await page.mouse.up();
}

const annotationRects = (page: Page) => page.locator(".harie-canvas-image rect");

/** 編集面のベース画像の URL が読み込めること（描き直しで破棄済みの URL を使っていない） */
async function expectBaseImageLoadable(page: Page) {
  const href = await page.locator(".harie-canvas-image image").first().getAttribute("href");
  expect(href).toMatch(/^blob:/);
  const ok = await page.evaluate(async (url) => {
    try {
      return (await fetch(url as string)).ok;
    } catch {
      return false;
    }
  }, href);
  expect(ok).toBe(true);
}

test("FR-FILE-08, FR-EDIT-01〜04, 07: 画像を開いて注釈を付け、元に戻す・やり直す", async ({
  page,
}) => {
  await openFixture(page, "large-base.jpg");
  // DOM 情報のない画像では「要素で囲む」は出さない（FR-EDIT-15）
  await expect(page.getByRole("button", { name: "要素で囲む" })).toHaveCount(0);
  await page.getByRole("button", { name: "四角" }).click();
  await drag(page, [40, 40], [240, 120]);
  await expect(annotationRects(page)).toHaveCount(1);
  await expect(page.locator("[data-selected]")).toHaveCount(1);
  await expectBaseImageLoadable(page);

  await page.getByRole("button", { name: "元に戻す" }).click();
  await expect(annotationRects(page)).toHaveCount(0);
  await page.keyboard.press("Control+Shift+Z");
  await expect(annotationRects(page)).toHaveCount(1);

  // 選択して移動 → Delete で削除 → Ctrl+Z で戻る
  await drag(page, [140, 42], [180, 82]);
  await expect(annotationRects(page).first()).toHaveAttribute("x", "80");
  await page.keyboard.press("Delete");
  await expect(annotationRects(page)).toHaveCount(0);
  await page.keyboard.press("Control+Z");
  await expect(annotationRects(page)).toHaveCount(1);
});

test("FR-FILE-06: 保存したファイルは普通の JPEG で、開き直すと同じ注釈を編集できる", async ({
  page,
}) => {
  await openFixture(page, "large-base.jpg");
  await page.getByRole("button", { name: "四角" }).click();
  await drag(page, [40, 40], [240, 120]);
  await page.getByRole("button", { name: "吹き出し", exact: true }).click();
  await drag(page, [260, 60], [260, 60]);
  const textarea = page.getByRole("textbox", { name: "文字", exact: true });
  await textarea.fill("ここで通知を設定します");
  await textarea.blur();
  await page.getByRole("button", { name: "青" }).click();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "保存" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("large-base.harie.jpg");
  const file = new Uint8Array(readFileSync(await download.path()));
  const read = readHarie(file);
  expect(read.kind).toBe("harie");
  if (read.kind !== "harie") return;
  expect(read.doc.revision).toBe(1);
  expect(read.doc.annotations.map((a) => a.type)).toEqual(["rect", "callout"]);
  // 画面上でドラッグした位置が、画像の座標として記録されている
  expect(read.doc.annotations[0]).toMatchObject({ x: 40, y: 40, w: 200, h: 80 });
  expect(read.doc.annotations[1]).toMatchObject({
    text: "ここで通知を設定します",
    style: { stroke: "#0B6BCB" },
  });
  // ベース画像は読み込んだバイト列のまま（ADR-0004）
  expect(read.base.bytes).toEqual(new Uint8Array(fixture("large-base.jpg")));

  // NFR-PLAT-05: ブラウザで保存したファイルと、Node で同じ注釈から作ったファイルがバイト単位で一致する
  const rendered = await (await nodeRenderer()).render({
    doc: read.doc,
    base: read.base,
    output: "jpeg",
  });
  expect(writeHarie({ rendered, base: read.base.bytes, doc: read.doc })).toEqual(file);

  // 開き直すと注釈が戻り、続けて編集できる
  await page.getByLabel("画像ファイル").setInputFiles({
    name: "large-base.harie.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from(file),
  });
  await expect(page.locator(".harie-canvas-image svg")).toContainText("ここで通知を設定");
  await expect(page.locator(".app-file-name")).toHaveText("large-base.harie.jpg");
});

test("FR-FILE-01, 02: 保存形式を選べ、JPEG を PNG で保存してもベース画像はそのまま残る", async ({
  page,
}) => {
  await openFixture(page, "large-base.jpg");
  const header = page.getByRole("banner");
  // 既定は開いたファイルの形式
  await expect(header.getByRole("button", { name: "ファイル形式: JPEG" })).toBeVisible();
  // メニューの開閉ボタンは、ほかのヘッダーのボタンと同じ高さ（狭い画面用の三点メニューは出ていない）
  await expect(header.getByRole("button", { name: "その他の操作" })).toBeHidden();
  const heights = await header
    .getByRole("button")
    .evaluateAll((els) =>
      els.filter((el) => el.checkVisibility()).map((el) => el.getBoundingClientRect().height),
    );
  expect(new Set(heights).size).toBe(1);
  await page.getByRole("button", { name: "四角" }).click();
  await drag(page, [40, 40], [240, 120]);
  await header.getByRole("button", { name: "ファイル形式: JPEG" }).click();
  await page.getByRole("menuitemradio", { name: /^PNG/ }).click();
  await expect(header.getByRole("button", { name: "ファイル形式: PNG" })).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "保存" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("large-base.harie.png");
  const file = new Uint8Array(readFileSync(await download.path()));
  const read = readHarie(file);
  expect(read).toMatchObject({ kind: "harie", format: "png", base: { mediaType: "image/jpeg" } });
  if (read.kind !== "harie") return;
  expect(read.base.bytes).toEqual(new Uint8Array(fixture("large-base.jpg")));
  // NFR-PLAT-05: PNG で保存しても Node の結果とバイト単位で一致する
  const rendered = await (await nodeRenderer()).render({
    doc: read.doc,
    base: read.base,
    output: "png",
  });
  expect(writeHarie({ rendered, base: read.base.bytes, doc: read.doc })).toEqual(file);

  // 保存したファイルを開き直すと、既定の保存形式は PNG になる
  await page.getByLabel("画像ファイル").setInputFiles({
    name: "large-base.harie.png",
    mimeType: "image/png",
    buffer: Buffer.from(file),
  });
  await expect(page.locator(".app-file-name")).toHaveText("large-base.harie.png");
  await expect(header.getByRole("button", { name: "ファイル形式: PNG" })).toBeVisible();
});

test("FR-FILE-02: 保存ダイアログは、保存する形式（既定は開いたファイルの形式）の拡張子を既定にする", async ({
  page,
}) => {
  // File System Access API を差し替え、保存ダイアログに渡した指定を記録する
  await page.addInitScript(
    (png: number[]) => {
      const w = window as unknown as Record<string, unknown>;
      const calls: unknown[] = [];
      w.__saveCalls = calls;
      const writable = { write: async () => {}, close: async () => {} };
      w.showOpenFilePicker = async () => [
        {
          getFile: async () => new File([new Uint8Array(png)], "screen.png", { type: "image/png" }),
          createWritable: async () => writable,
        },
      ];
      w.showSaveFilePicker = async (options: unknown) => {
        calls.push(options);
        return { createWritable: async () => writable };
      };
    },
    [...fixture("base.png")],
  );
  await page.goto("/");
  await page.getByRole("banner").getByRole("button", { name: "画像を開く" }).click();
  const header = page.getByRole("banner");
  await expect(header.getByRole("button", { name: "ファイル形式: PNG" })).toBeVisible();
  await header.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("screen.harie.png を保存しました");
  const [call] = await page.evaluate(
    () => (window as unknown as { __saveCalls: unknown[] }).__saveCalls,
  );
  expect(call).toEqual({
    suggestedName: "screen.harie.png",
    types: [{ description: "PNG 画像", accept: { "image/png": [".png"] } }],
  });
});

test("FR-EDIT-03: テキストは置いた直後とダブルクリックで、その場で文字を直せる。文字サイズは見本と px で変えられる", async ({
  page,
}) => {
  await openFixture(page, "large-base.jpg");
  const image = page.locator(".harie-canvas-image svg");
  await page.getByRole("button", { name: "テキスト" }).click();
  await drag(page, [60, 200], [60, 200]);
  // 置いた直後はその場の入力欄が開いている
  const inline = page.getByLabel("テキストを編集");
  await expect(inline).toBeFocused();
  await inline.fill("設定を開く");
  await inline.press("Control+Enter");
  await expect(inline).toHaveCount(0);
  await expect(image).toContainText("設定を開く");

  // ダブルクリックで開き直し、Esc で取りやめると変わらない
  const box = await page.getByRole("application", { name: "注釈の編集面" }).boundingBox();
  if (box === null) throw new Error("編集面がない");
  const k = Math.min(box.width / 520, box.height / 400);
  const at = (x: number, y: number) =>
    [
      box.x + (box.width - 520 * k) / 2 + x * k,
      box.y + (box.height - 400 * k) / 2 + y * k,
    ] as const;
  await page.mouse.dblclick(...at(70, 210));
  await expect(inline).toBeFocused();
  await inline.fill("取りやめる文字");
  await inline.press("Escape");
  await expect(image).toContainText("設定を開く");

  // 確定は 1 回の操作。元に戻すと前の文字に戻る
  await page.mouse.dblclick(...at(70, 210));
  await inline.fill("通知を設定する");
  await page.getByRole("button", { name: "選択" }).click();
  await expect(image).toContainText("通知を設定する");
  await expect(page.getByRole("textbox", { name: "文字", exact: true })).toHaveValue(
    "通知を設定する",
  );
  await page.getByRole("button", { name: "元に戻す" }).click();
  await expect(image).toContainText("設定を開く");

  // 文字サイズ: 見本から選ぶ・「数値で指定」を開いて px を直接入れる
  const text = image.locator("text").first();
  await expect(text).toHaveAttribute("font-size", "24");
  await page.getByRole("button", { name: "特大" }).click();
  await expect(text).toHaveAttribute("font-size", "48");
  await page.getByRole("button", { name: "数値で指定" }).click();
  const px = page.getByLabel("文字サイズ（px）");
  await px.fill("30");
  await px.press("Enter");
  await expect(text).toHaveAttribute("font-size", "30");
  await expect(page.getByRole("button", { name: "特大" })).toHaveAttribute("aria-pressed", "false");
});

test("FR-EDIT-16: 大きな画像では既定の線の太さと候補を倍率に合わせ、選んだ太さは等倍に戻して覚える", async ({
  page,
}) => {
  await page.goto("/");
  // 2880x1800（Retina の画面を撮った大きさ）の PNG をその場で作る
  const png = await page.evaluate(async () => {
    const canvas = new OffscreenCanvas(2880, 1800);
    const ctx = canvas.getContext("2d");
    if (ctx === null) throw new Error("2d がない");
    ctx.fillStyle = "#e8eef6";
    ctx.fillRect(0, 0, 2880, 1800);
    const blob = await canvas.convertToBlob({ type: "image/png" });
    return [...new Uint8Array(await blob.arrayBuffer())];
  });
  await page
    .getByLabel("画像ファイル")
    .setInputFiles({ name: "retina.png", mimeType: "image/png", buffer: Buffer.from(png) });
  await expect(page.getByRole("application", { name: "注釈の編集面" })).toBeVisible();
  await page.getByRole("button", { name: "四角" }).click();
  await drag(page, [400, 400], [1600, 900], [2880, 1800]);
  const rect = annotationRects(page).first();
  await expect(rect).toHaveAttribute("stroke-width", "8");
  // 候補も 2 倍で出す（中 = 8、太 = 12）
  const thick = page.getByRole("button", { name: "太", exact: true });
  await expect(thick).toContainText("12");
  await thick.click();
  await expect(rect).toHaveAttribute("stroke-width", "12");

  // 等倍の画像では、覚えた「太」は 6 になる
  await openFixture(page, "large-base.jpg");
  await page.getByRole("button", { name: "四角" }).click();
  await drag(page, [40, 40], [240, 120]);
  await expect(annotationRects(page).first()).toHaveAttribute("stroke-width", "6");
});

test("FR-EDIT-01: 四角の線の太さと種類を変えられ、選んだ太さ・文字サイズ・番号の大きさは次に描くときの初期値になる", async ({
  page,
}) => {
  const fontTile = (name: string) =>
    page.getByRole("group", { name: "文字サイズ" }).getByRole("button", { name, exact: true });
  await openFixture(page, "large-base.jpg");
  await page.getByRole("button", { name: "四角" }).click();
  await drag(page, [40, 40], [240, 120]);
  const rect = annotationRects(page).first();
  await expect(rect).toHaveAttribute("stroke-width", "4");
  // 右の欄の操作は見出しと同じ 13px（ブラウザ既定の 16px にしない）
  await expect(page.getByRole("button", { name: "この注釈を削除" })).toHaveCSS("font-size", "13px");
  // 選んだ色の輪（4px）が右の欄の左端で切れない
  const swatch = await page.getByRole("button", { name: "赤", exact: true }).boundingBox();
  const inspector = await page.locator(".harie-inspector").boundingBox();
  if (swatch === null || inspector === null) throw new Error("右の欄がない");
  expect(swatch.x - 4).toBeGreaterThanOrEqual(inspector.x);

  await page.getByRole("button", { name: "太", exact: true }).click();
  await expect(rect).toHaveAttribute("stroke-width", "6");
  await page.getByRole("button", { name: "破線" }).click();
  await expect(rect).toHaveAttribute("stroke-dasharray", "18 12");
  await page.getByRole("button", { name: "点線" }).click();
  await expect(rect).toHaveAttribute("stroke-dasharray", "0 12");
  await page.getByRole("button", { name: "実線" }).click();
  await expect(rect).not.toHaveAttribute("stroke-dasharray", /.*/);
  await page.getByRole("button", { name: "数値で指定" }).click();
  const width = page.getByLabel("線の太さ（px）");
  await width.fill("8");
  await width.press("Enter");
  await expect(rect).toHaveAttribute("stroke-width", "8");

  // 吹き出しの文字サイズを選ぶ
  await page.getByRole("button", { name: "吹き出し", exact: true }).click();
  await drag(page, [260, 200], [260, 200]);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "大", exact: true }).click();

  // 開き直しても、次に描く四角・吹き出しは前回の太さ・文字サイズで描かれる
  await page.reload();
  await openFixture(page, "large-base.jpg");
  await page.getByRole("button", { name: "四角" }).click();
  await drag(page, [40, 40], [240, 120]);
  await expect(annotationRects(page).first()).toHaveAttribute("stroke-width", "8");
  await expect(page.getByLabel("線の太さ（px）")).toHaveValue("8");
  await page.getByRole("button", { name: "吹き出し", exact: true }).click();
  await drag(page, [260, 200], [260, 200]);
  await expect(fontTile("大")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");

  // 番号の大きさは吹き出しの文字サイズと別に記録する
  await page.getByRole("button", { name: "番号", exact: true }).click();
  await drag(page, [40, 300], [40, 300]);
  await expect(fontTile("中")).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "小", exact: true }).click();
  await page.getByRole("button", { name: "番号", exact: true }).click();
  await drag(page, [120, 300], [120, 300]);
  await expect(fontTile("小")).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "吹き出し", exact: true }).click();
  await drag(page, [260, 320], [260, 320]);
  await expect(fontTile("大")).toHaveAttribute("aria-pressed", "true");
});

test("FR-EDIT-17: 色を作ってパレットに足すと線の色になり、別の画像を開き直しても使える", async ({
  page,
}) => {
  await openFixture(page, "large-base.jpg");
  await page.getByRole("button", { name: "四角" }).click();
  await drag(page, [40, 40], [240, 120]);
  const rect = annotationRects(page).first();
  await page.getByRole("button", { name: "色を作ってパレットに追加" }).click();
  const code = page.getByLabel("カラーコード（#RRGGBB）");
  await code.fill("12345");
  await expect(page.getByRole("button", { name: "追加", exact: true })).toBeDisabled();
  await code.fill("#7a3cf0");
  await page.getByRole("button", { name: "追加", exact: true }).click();
  await expect(rect).toHaveAttribute("stroke", "#7A3CF0");
  const saved = page.getByRole("button", { name: "パレットの色 #7A3CF0" });
  await expect(saved).toHaveAttribute("aria-pressed", "true");

  // 別の画像を開き直しても、パレットの色で塗れる
  await page.reload();
  await openFixture(page, "base.png", "image/png");
  await page.getByRole("button", { name: "四角" }).click();
  await drag(page, [8, 8], [40, 30], [64, 40]);
  await page.getByRole("button", { name: "パレットの色 #7A3CF0" }).click();
  await expect(annotationRects(page).first()).toHaveAttribute("stroke", "#7A3CF0");

  // パレットから外せる
  await page.getByRole("button", { name: "選んだ色をパレットから外す" }).click();
  await expect(page.getByRole("button", { name: "パレットの色 #7A3CF0" })).toHaveCount(0);
  await page.reload();
  expect(await page.evaluate(() => localStorage.getItem("harie.colorPalette"))).toBe("[]");
});

test("FR-EDIT-11: 注釈を複数選んで、まとめて線の太さ・色を変え、動かし、削除できる", async ({
  page,
}) => {
  await openFixture(page, "large-base.jpg");
  await page.getByRole("button", { name: "四角" }).click();
  await drag(page, [40, 40], [140, 100]);
  await page.getByRole("button", { name: "四角" }).click();
  await drag(page, [200, 40], [300, 100]);
  await page.getByRole("button", { name: "太", exact: true }).click();
  const rects = annotationRects(page);
  await expect(rects.nth(1)).toHaveAttribute("stroke-width", "6");

  // 何もない所からドラッグして、範囲に重なる注釈を選ぶ
  await drag(page, [20, 20], [220, 60]);
  const inspector = page.getByRole("complementary", { name: "選択中の注釈" });
  await expect(inspector.getByRole("heading", { name: /2 個の注釈/ })).toBeVisible();
  const width = inspector.getByRole("group", { name: /線の太さ/ });
  await expect(width).toContainText("混在");
  await expect(width.getByRole("button", { name: "中", exact: true })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await width.getByRole("button", { name: "細", exact: true }).click();
  await expect(rects.nth(0)).toHaveAttribute("stroke-width", "2");
  await expect(rects.nth(1)).toHaveAttribute("stroke-width", "2");
  await inspector.getByRole("button", { name: "青" }).click();
  await expect(rects.nth(0)).toHaveAttribute("stroke", "#0B6BCB");
  await expect(rects.nth(1)).toHaveAttribute("stroke", "#0B6BCB");

  // 選んだ注釈の 1 つを掴むと、まとめて動く（1 回の操作として元に戻せる）
  const y = async (i: number) => Number(await rects.nth(i).getAttribute("y"));
  const before = [await y(0), await y(1)];
  await drag(page, [90, 40], [90, 140]);
  await expect.poll(() => y(0)).toBeGreaterThan((before[0] ?? 0) + 90);
  await expect.poll(() => y(1)).toBeGreaterThan((before[1] ?? 0) + 90);
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => y(0)).toBe(before[0]);
  await expect.poll(() => y(1)).toBe(before[1]);

  // Shift + クリックで選択から外す。残った 1 つだけが消える
  await page.keyboard.down("Shift");
  await drag(page, [250, 40], [250, 40]);
  await page.keyboard.up("Shift");
  await expect(inspector.getByRole("heading", { name: /四角/ })).toBeVisible();
  await page.keyboard.press("Delete");
  await expect(rects).toHaveCount(1);

  // すべて選んで、まとめて消す
  await page.getByRole("button", { name: "矢印" }).click();
  await drag(page, [100, 300], [300, 300]);
  await page.keyboard.press("ControlOrMeta+a");
  await page.getByRole("button", { name: "選んだ注釈をすべて削除" }).click();
  await expect(rects).toHaveCount(0);
});

test("FR-EDIT-14: 番号・吹き出しのない枠に、ボタン 1 つで番号と吹き出しを付ける", async ({
  page,
}) => {
  await openFixture(page, "large-base.jpg");
  for (const y of [40, 200]) {
    await page.getByRole("button", { name: "四角" }).click();
    await drag(page, [40, y], [200, y + 60]);
  }
  await page.keyboard.press("Escape");
  const steps = page.getByRole("region", { name: "番号と吹き出し" });
  await expect(steps).toContainText("番号か吹き出しのない枠が 2 個あります");

  await steps.getByRole("button", { name: "番号と吹き出しを付ける" }).click();
  // 番号 2 つ（描いた順に 1, 2）と、枠を指す吹き出し 2 つ（四角 2 + 吹き出し 2）
  await expect(page.locator(".harie-canvas-image circle")).toHaveCount(2);
  await expect(page.locator(".harie-canvas-image text", { hasText: /^[12]$/ })).toHaveText([
    "1",
    "2",
  ]);
  await expect(annotationRects(page)).toHaveCount(4);
  await expect(page.locator(".harie-canvas-image line")).toHaveCount(2);
  await expect(steps).toHaveCount(0);

  // まとめて 1 回の操作として元に戻せる
  await page.keyboard.press("Control+Z");
  await expect(page.locator(".harie-canvas-image circle")).toHaveCount(0);
  await expect(annotationRects(page)).toHaveCount(2);

  // 枠を選んでいるときは、選んだ枠の設定と分けて右の欄の下端に置く
  await drag(page, [30, 30], [210, 110]);
  await expect(steps).toContainText("選んだ枠のうち 1 個に");
  const aside = await page.getByRole("complementary", { name: "選択中の注釈" }).boundingBox();
  const card = await steps.boundingBox();
  if (aside === null || card === null) throw new Error("右の欄がない");
  expect(aside.y + aside.height - (card.y + card.height)).toBeLessThanOrEqual(20);
});

test("ツールのパレットは描いている間は隠れ、たたむと小さくなる", async ({ page }) => {
  await openFixture(page, "large-base.jpg");
  const palette = page.getByRole("toolbar", { name: "ツール" });
  await page.getByRole("button", { name: "四角" }).click();
  const box = await page.getByRole("application", { name: "注釈の編集面" }).boundingBox();
  if (box === null) throw new Error("編集面がない");
  await page.mouse.move(box.x + 40, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 100);
  await expect(palette).toHaveAttribute("data-hidden", "true");
  await page.mouse.up();
  await expect(palette).toHaveAttribute("data-hidden", "false");

  await palette.getByRole("button", { name: "ツールをたたむ" }).click();
  await expect(palette.getByRole("button", { name: "四角" })).toHaveCount(0);
  await palette.getByRole("button", { name: "ツールを表示" }).click();
  await expect(palette.getByRole("button", { name: "四角" })).toBeVisible();
});

test("ヘッダーの「画像を開く」は、今の画像を閉じる前に確認する", async ({ page }) => {
  await openFixture(page, "large-base.jpg");
  const header = page.getByRole("banner");
  await expect(header.getByRole("button")).toHaveText([
    "画像を開く",
    "画像を差し替える",
    "JPEG",
    "保存",
    "コピー",
    "連携",
    "設定",
  ]);
  await header.getByRole("button", { name: "画像を開く" }).click();
  const confirm = page.getByRole("dialog", { name: "画像を開く" });
  await expect(confirm).toContainText("large-base.jpg");
  await expect(confirm).not.toContainText("保存していない変更");
  await confirm.getByRole("button", { name: "キャンセル" }).click();
  await expect(confirm).toBeHidden();

  // 保存していない変更があれば、失われることを伝える
  await page.getByRole("button", { name: "四角" }).click();
  await drag(page, [40, 40], [240, 120]);
  await header.getByRole("button", { name: "画像を開く" }).click();
  await expect(confirm).toContainText("保存していない変更は失われます");
  await page.keyboard.press("Escape");
  await expect(confirm).toBeHidden();
  await expect(annotationRects(page)).toHaveCount(1);
});

test("FR-CAP-05: ドラッグ＆ドロップと貼り付けで画像を取り込める", async ({ page }) => {
  await page.goto("/");
  const bytes = [...fixture("base.png")];
  await page.evaluate((data) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(data)], "dropped.png", { type: "image/png" }));
    window.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, cancelable: true }));
  }, bytes);
  await expect(page.locator(".app-file-name")).toHaveText("dropped.png");

  await page.evaluate((data) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(data)], "pasted.png", { type: "image/png" }));
    window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, cancelable: true }));
  }, bytes);
  await expect(page.locator(".app-file-name")).toHaveText("pasted.png");
});

test("画像でないファイルは開かずに理由を表示する", async ({ page }) => {
  await page.goto("/");
  await page
    .getByLabel("画像ファイル")
    .setInputFiles({ name: "note.png", mimeType: "image/png", buffer: Buffer.from("hello") });
  await expect(page.getByRole("alert")).toContainText("JPEG か PNG");
});

test("FR-EDIT-05, FR-PII-04: 個人情報のマスクはベース画像に焼き込まれ、元の画像は保存されない", async ({
  page,
}) => {
  await openFixture(page, "large-base.jpg");
  await page.getByRole("button", { name: "個人情報を隠す" }).click();
  await drag(page, [20, 20], [220, 60]);
  await drag(page, [20, 100], [220, 140]);
  const panel = page.getByRole("region", { name: "個人情報のマスク" });
  await panel
    .getByRole("group", { name: "範囲 2 の隠し方" })
    .getByRole("button", { name: "ダミーの文字に置き換え" })
    .click();
  await panel.getByLabel("置き換える文字").fill("佐藤 花子");
  await panel.getByRole("button", { name: "マスクを適用する" }).click();
  await panel.getByRole("button", { name: "適用する", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("2 か所をマスクしました");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "保存" }).click(),
  ]);
  const file = new Uint8Array(readFileSync(await download.path()));
  const read = readHarie(file);
  expect(read.kind).toBe("harie");
  if (read.kind !== "harie") return;
  // 記録は種別・方法・範囲だけ。置き換えた文字も残さない
  expect(read.doc.pii.applied).toEqual([
    { kind: "other", method: "fill", rect: { x: 20, y: 20, w: 200, h: 40 } },
    { kind: "other", method: "replace", rect: { x: 20, y: 100, w: 200, h: 40 } },
  ]);
  expect(Buffer.from(file).includes(Buffer.from("佐藤 花子"))).toBe(false);
  // 元のベース画像はファイルのどこにも入っていない
  const original = fixture("large-base.jpg");
  expect(Buffer.from(file).includes(original.subarray(original.length - 4096))).toBe(false);

  // NFR-PLAT-05: ブラウザでの加工結果は Node の applyMasks と同じバイト列になる
  const masked = await (await nodeRenderer()).applyMasks({
    base: { bytes: new Uint8Array(original), mediaType: "image/jpeg" },
    width: read.doc.canvas.width,
    height: read.doc.canvas.height,
    masks: [
      { kind: "other", method: "fill", rect: { x: 20, y: 20, w: 200, h: 40 } },
      {
        kind: "other",
        method: "replace",
        rect: { x: 20, y: 100, w: 200, h: 40 },
        replacement: "佐藤 花子",
      },
    ],
  });
  expect(read.base.bytes).toEqual(masked.base.bytes);
});

test("FR-FILE-05: 別のアプリで編集された Harie ファイルは、どちらで開くか選べる", async ({
  page,
}) => {
  const base = fixture("base.jpg");
  const doc = {
    ...createDocument({ width: 64, height: 40, now: new Date("2026-10-08T00:00:00Z") }),
    annotations: [{ id: "rect-1", type: "rect" as const, x: 4, y: 4, w: 30, h: 16 }],
  };
  const rendered = await (await nodeRenderer()).render({
    doc,
    base: { bytes: new Uint8Array(base), mediaType: "image/jpeg" },
    output: "jpeg",
  });
  const file = writeHarie({ rendered, base: new Uint8Array(base), doc });
  // 画像データの 1 バイトだけを変える（別のアプリで編集・再保存された状態）
  const tampered = file.slice();
  const at = tampered.length - 10;
  tampered[at] = (tampered[at] as number) ^ 0x01;

  await page.goto("/");
  await page.getByLabel("画像ファイル").setInputFiles({
    name: "modified.harie.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from(tampered),
  });
  const warning = page.getByRole("alert");
  await expect(warning).toContainText("別のアプリで編集されています");
  // 既定は保存されていた注釈で開く
  await expect(annotationRects(page)).toHaveCount(1);

  await warning.getByRole("button", { name: "今の画像を新しい下地にする" }).click();
  await expect(annotationRects(page)).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.locator(".app-file-name")).toHaveText("modified.harie.jpg");
});

test("NFR-PLAT-01: 一度開いたあとはオフラインでも起動し、画像を編集して保存できる", async ({
  page,
  context,
}) => {
  await page.goto("/");
  // Service Worker が描画エンジン（WASM）とフォントまでキャッシュし終えるのを待つ
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("button", { name: "画像を開く" })).toBeVisible();

  await page.getByLabel("画像ファイル").setInputFiles({
    name: "large-base.jpg",
    mimeType: "image/jpeg",
    buffer: fixture("large-base.jpg"),
  });
  await page.getByRole("button", { name: "四角" }).click();
  await drag(page, [40, 40], [240, 120]);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "保存" }).click(),
  ]);
  const read = readHarie(new Uint8Array(readFileSync(await download.path())));
  expect(read.kind === "harie" && read.doc.annotations).toHaveLength(1);
});

/** Claude API の代わりに決まった応答を返す。送られたリクエストを記録する */
async function fakeClaude(page: Page) {
  const requests: { headers: Record<string, string>; body: Record<string, unknown> }[] = [];
  await page.route("https://api.anthropic.com/v1/messages*", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    requests.push({ headers: route.request().headers(), body });
    const pii = JSON.stringify(body.output_config).includes("findings");
    const output = pii
      ? {
          findings: [
            {
              kind: "email",
              box: { x: 20, y: 20, width: 200, height: 20 },
              text: "taro@corp.example",
            },
            { kind: "face", box: { x: 300, y: 20, width: 60, height: 60 }, text: "" },
          ],
        }
      : {
          suggestions: [
            {
              target: { x: 40, y: 40, width: 120, height: 40 },
              elementIndex: null,
              text: "ここを押します",
            },
            {
              target: { x: 40, y: 200, width: 120, height: 40 },
              elementIndex: null,
              text: "次にここを確認します",
            },
          ],
        };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({
        id: "msg_test",
        type: "message",
        role: "assistant",
        model: "claude-opus-5-5",
        content: [{ type: "text", text: JSON.stringify(output) }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 10 },
      }),
    });
  });
  return requests;
}

test("FR-AI-01, 02, NFR-SEC-01, 04: AI の提案は同意してから送り、採用したものだけを保存する", async ({
  page,
}) => {
  const requests = await fakeClaude(page);
  await openFixture(page, "large-base.jpg");
  // AI に接続するまでは、普段の画面に AI の操作を出さない（パレットにも右の欄にも出ない）
  const action = page.getByRole("button", { name: "AI提案" });
  await expect(action).toHaveCount(0);
  await expect(page.locator(".app-ai")).toHaveCount(0);
  await page.getByRole("banner").getByRole("button", { name: "設定" }).click();
  const settings = page.getByRole("dialog", { name: "設定" });
  await settings.getByLabel("API キー").fill("sk-ant-e2e-dummy");
  await settings.getByRole("button", { name: "キーを登録" }).click();
  await expect(settings).toContainText("API キーは登録済みです");
  await settings.getByRole("button", { name: "閉じる" }).click();
  await expect(settings).toBeHidden();

  // 接続するとパレットに「AI提案」が出て、押すとダイアログで聞く。同意するまでは送れない
  await action.click();
  const dialog = page.getByRole("dialog", { name: "AIでガイドを作成" });
  const suggest = dialog.getByRole("button", { name: "AI に提案してもらう" });
  await expect(dialog).toContainText("Anthropic の Claude API に送信します");
  await expect(suggest).toBeDisabled();
  await dialog.getByLabel("この画像を送信してよい").check();
  await dialog.getByLabel("説明したいこと").fill("通知の設定方法");
  await suggest.click();
  await expect(dialog).toBeHidden();

  // 提案が残っている間だけ、右の欄の末尾にまとめて採用・却下する欄が出る
  const ai = page.getByRole("region", { name: "AI提案" });
  const list = ai.locator("li");
  await expect(list).toHaveCount(2);
  await expect(page.locator("[data-suggested]")).toHaveCount(4);
  expect(requests).toHaveLength(1);
  const [request] = requests;
  if (request === undefined) throw new Error("送られていない");
  expect(request.headers["x-api-key"]).toBe("sk-ant-e2e-dummy");
  const content = (request.body.messages as { content: Record<string, unknown>[] }[])[0]?.content;
  expect(content?.[0]).toMatchObject({
    type: "image",
    source: { data: fixture("large-base.jpg").toString("base64") },
  });
  expect(JSON.stringify(content?.[1])).toContain("通知の設定方法");

  await list.first().getByRole("button", { name: "採用" }).click();
  await ai.getByRole("button", { name: "すべて却下" }).click();
  await expect(list).toHaveCount(0);
  await expect(page.locator("[data-suggested]")).toHaveCount(0);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "保存", exact: true }).click(),
  ]);
  const file = new Uint8Array(readFileSync(await download.path()));
  const read = readHarie(file);
  if (read.kind !== "harie") throw new Error("Harie ファイルではない");
  expect(read.doc.annotations.map((a) => [a.type, a.status])).toEqual([
    ["rect", undefined],
    ["callout", undefined],
  ]);
  expect(read.doc.annotations[1]).toMatchObject({ text: "ここを押します" });
  // API キーはファイルに入らない
  expect(Buffer.from(file).includes(Buffer.from("sk-ant-e2e-dummy"))).toBe(false);
});

test("FR-PII-01, 02: 見つけた個人情報はマスクの下書きになり、文字は既定でダミーに置き換える", async ({
  page,
}) => {
  await fakeClaude(page);
  await page.addInitScript(() => localStorage.setItem("harie.anthropicApiKey", "sk-ant-e2e-dummy"));
  await openFixture(page, "large-base.jpg");
  // 個人情報を探す操作は、個人情報を隠す道具を選んだときだけ、マスクの欄の末尾に出る
  await expect(page.getByRole("region", { name: "個人情報を探す" })).toHaveCount(0);
  await page.getByRole("button", { name: "個人情報を隠す" }).click();
  const panel = page.getByRole("region", { name: "個人情報のマスク" });
  const pii = panel.getByRole("region", { name: "個人情報を探す" });
  await pii.getByLabel("この画像を送信してよい").check();
  await pii.getByRole("button", { name: "AI で画像から探す" }).click();
  await expect(pii.getByRole("status")).toContainText("2 か所の候補");

  await expect(
    panel
      .getByRole("group", { name: "範囲 1（メール）の隠し方" })
      .getByRole("button", { name: "ダミーの文字に置き換え" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(panel.getByLabel("置き換える文字")).toHaveValue("user1@example.com");
  await expect(
    panel
      .getByRole("group", { name: "範囲 2（顔）の隠し方" })
      .getByRole("button", { name: "塗りつぶし" }),
  ).toHaveAttribute("aria-pressed", "true");
  await panel.getByRole("button", { name: "マスクを適用する" }).click();
  await panel.getByRole("button", { name: "適用する", exact: true }).click();
  await expect(page.getByRole("status").first()).toContainText("2 か所をマスクしました");
});

test("FR-EDIT-05: 個人情報を隠すを押し間違えたら、キャンセルで範囲を捨てて元の道具に戻れる", async ({
  page,
}) => {
  await openFixture(page, "large-base.jpg");
  await page.getByRole("button", { name: "個人情報を隠す" }).click();
  await drag(page, [20, 20], [220, 60]);
  const panel = page.getByRole("region", { name: "個人情報のマスク" });
  // 適用は確認してから。戻るを押せば何も変わらない
  await panel.getByRole("button", { name: "マスクを適用する" }).click();
  await expect(panel.getByRole("alertdialog", { name: "マスクの適用の確認" })).toBeVisible();
  await panel.getByRole("button", { name: "戻る" }).click();
  await panel.getByRole("button", { name: "キャンセル" }).click();
  await expect(panel).toBeHidden();
  await expect(page.locator(".harie-mask-draft")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "選択" })).toHaveAttribute("aria-pressed", "true");
});

test("FR-EDIT-05, 07: マスクの範囲を足す・隠し方を変えるのも、元に戻す・やり直すの対象になる", async ({
  page,
}) => {
  await openFixture(page, "large-base.jpg");
  await page.getByRole("button", { name: "個人情報を隠す" }).click();
  await drag(page, [20, 20], [220, 60]);
  const panel = page.getByRole("region", { name: "個人情報のマスク" });
  const blur = panel
    .getByRole("group", { name: "範囲 1 の隠し方" })
    .getByRole("button", { name: "ぼかし" });
  await blur.click();
  await expect(blur).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "元に戻す" }).click();
  await expect(blur).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Control+Z");
  await expect(page.locator(".harie-mask-draft")).toHaveCount(0);
  await page.keyboard.press("Control+Shift+Z");
  await expect(page.locator(".harie-mask-draft")).toHaveCount(1);
});

test("FR-EDIT-05: マスクの範囲を選んでいる間に削除しても、前に選んでいた注釈は消えない", async ({
  page,
}) => {
  await openFixture(page, "large-base.jpg");
  await page.getByRole("button", { name: "四角" }).click();
  await drag(page, [40, 40], [240, 120]);
  await expect(annotationRects(page)).toHaveCount(1);
  await page.getByRole("button", { name: "個人情報を隠す" }).click();
  await drag(page, [20, 200], [220, 240]);
  // 四角の選択は外れ、右の欄には注釈の「削除」が出ない
  await expect(page.locator(".harie-selection")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "この注釈を削除" })).toHaveCount(0);
  await page.keyboard.press("Delete");
  await expect(annotationRects(page)).toHaveCount(1);
  await page
    .getByRole("region", { name: "個人情報のマスク" })
    .getByRole("button", { name: "範囲 1 を削除" })
    .click();
  await expect(page.locator(".harie-mask-draft")).toHaveCount(0);
  await expect(annotationRects(page)).toHaveCount(1);
});

test("FR-CAP-07, FR-MCP-07: ヘッダーの「連携」で、Chrome 拡張の入れ方と MCP の登録方法を案内する", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await page.getByRole("banner").getByRole("button", { name: "連携" }).click();
  const guide = page.getByRole("dialog", { name: "ほかのツールと使う" });
  await expect(guide.getByRole("link", { name: "Chrome ウェブストアで入れる" })).toHaveAttribute(
    "href",
    "https://chromewebstore.google.com/detail/harie/dgbghdgnmjcgjdmhfnmcdphkafkbefll",
  );
  const command = "claude mcp add harie -- npx -y @harie/mcp --root ~/Pictures/guides";
  await expect(
    guide.getByRole("figure", { name: "Claude Code に登録するコマンド" }).locator("pre"),
  ).toHaveText(command);
  await guide.getByRole("button", { name: "Claude Code に登録するコマンドをコピー" }).click();
  await expect(
    guide.getByRole("button", { name: "Claude Code に登録するコマンドをコピー" }),
  ).toHaveText("コピーしました");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(command);
  await guide.getByRole("button", { name: "閉じる" }).click();
  await expect(guide).toBeHidden();

  // 画像を開いた後の編集画面にも出る
  await openFixture(page, "large-base.jpg");
  await page.getByRole("banner").getByRole("button", { name: "連携" }).click();
  await expect(page.getByRole("dialog", { name: "ほかのツールと使う" })).toContainText(
    "@harie/mcp",
  );
});

/** 編集面のベース画像のバイト列 */
async function baseImageBytes(page: Page): Promise<Buffer> {
  const href = await page.locator(".harie-canvas-image image").first().getAttribute("href");
  const bytes = await page.evaluate(
    async (url) => [...new Uint8Array(await (await fetch(url as string)).arrayBuffer())],
    href,
  );
  return Buffer.from(bytes);
}

/** 画像の座標（px）を画面の座標に直してクリックする */
async function clickAt(page: Page, at: [number, number], size = [520, 400]) {
  await drag(page, at, at, size);
}

test("FR-EDIT-05, ADR-0009: 適用したマスクは保存するまで選んで外せ、保存すると外せない", async ({
  page,
}) => {
  await openFixture(page, "large-base.jpg");
  const original = fixture("large-base.jpg");
  await page.getByRole("button", { name: "個人情報を隠す" }).click();
  await drag(page, [20, 20], [220, 60]);
  await drag(page, [20, 100], [220, 140]);
  const panel = page.getByRole("region", { name: "個人情報のマスク" });
  await panel.getByRole("button", { name: "マスクを適用する" }).click();
  await panel.getByRole("button", { name: "適用する", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("2 か所をマスクしました");
  await expect(page.locator(".harie-mask-applied")).toHaveCount(2);

  // 1 つ目を選んで外す
  await clickAt(page, [120, 40]);
  const selected = page.getByRole("region", { name: "隠した範囲" });
  await expect(selected).toContainText("隠した範囲 1");
  await selected.getByRole("button", { name: "隠すのをやめる" }).click();
  await expect(page.getByRole("status")).toContainText("隠すのをやめました");
  await expect(page.locator(".harie-mask-applied")).toHaveCount(1);

  // 残りも Delete キーで外すと、読み込んだ画像のバイト列に戻る
  await clickAt(page, [120, 120]);
  await expect(page.getByRole("region", { name: "隠した範囲" })).toBeVisible();
  await page.keyboard.press("Delete");
  await expect(page.locator(".harie-mask-applied")).toHaveCount(0);
  await expect.poll(async () => (await baseImageBytes(page)).equals(original)).toBe(true);

  // もう一度隠して保存すると、記録が残り、外せなくなる
  await page.getByRole("button", { name: "個人情報を隠す" }).click();
  await drag(page, [20, 20], [220, 60]);
  await panel.getByRole("button", { name: "マスクを適用する" }).click();
  await panel.getByRole("button", { name: "適用する", exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "保存" }).click(),
  ]);
  const read = readHarie(new Uint8Array(readFileSync(await download.path())));
  expect(read.kind).toBe("harie");
  if (read.kind !== "harie") return;
  expect(read.doc.pii.applied).toEqual([
    { kind: "other", method: "fill", rect: { x: 20, y: 20, w: 200, h: 40 } },
  ]);
  await expect(page.locator(".harie-mask-applied")).toHaveCount(0);
  await clickAt(page, [120, 40]);
  await expect(page.getByRole("region", { name: "隠した範囲" })).toHaveCount(0);
});

test("NFR-PLAT-01: スマホの幅では、ファイル名を 1 行に収め、ヘッダーの操作を三点メニューにまとめ、パレットを横にスクロールする", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByLabel("画像ファイル").setInputFiles({
    name: "example.very-long-saas-service-name.dashboard.jpg",
    mimeType: "image/jpeg",
    buffer: fixture("large-base.jpg"),
  });
  const header = page.getByRole("banner");
  await expect(header.getByRole("button", { name: "保存" })).toBeVisible();
  // ページが横にはみ出さない
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  // ファイル名は 1 行（末尾を…にする）
  const name = header.locator(".app-file-name");
  expect((await name.boundingBox())?.height).toBeLessThan(32);
  expect(await name.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  // 保存以外の操作は三点メニューの中
  await expect(header.getByRole("button", { name: "画像を開く" })).toBeHidden();
  await expect(header.getByRole("button", { name: /ファイル形式/ })).toBeHidden();
  await expect(header.getByRole("button", { name: "設定" })).toBeHidden();
  await header.getByRole("button", { name: "その他の操作" }).click();
  await expect(page.getByRole("menuitem", { name: "画像を開く" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "連携" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "設定" })).toBeVisible();
  await page.getByRole("menuitemradio", { name: /^PNG/ }).click();
  await header.getByRole("button", { name: "その他の操作" }).click();
  await expect(page.getByRole("menuitemradio", { name: /^PNG/ })).toBeChecked();
  await page.getByRole("menuitem", { name: "設定" }).click();
  await expect(page.getByRole("dialog", { name: "設定" })).toBeVisible();
  await page.getByRole("dialog", { name: "設定" }).getByRole("button", { name: "閉じる" }).click();
  // パレットは折り返さず、横にスクロールして端の道具まで届く
  const scroller = page.locator(".harie-palette-scroll");
  expect(await scroller.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  await page.getByRole("button", { name: "個人情報を隠す" }).scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: "個人情報を隠す" }).click();
  await expect(page.getByRole("button", { name: "個人情報を隠す" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
