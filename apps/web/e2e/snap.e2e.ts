import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";

const fixture = readFileSync(
  new URL("../../../packages/format/fixtures/large-base.jpg", import.meta.url),
);

async function open(page: Page) {
  await page.goto("/");
  await page
    .getByLabel("画像ファイル")
    .setInputFiles({ name: "large-base.jpg", mimeType: "image/jpeg", buffer: fixture });
  await expect(page.getByRole("application", { name: "注釈の編集面" })).toBeVisible();
  await page.waitForFunction(
    () =>
      document.fonts.status === "loaded" &&
      [...document.fonts].every((f) => f.status !== "loading"),
  );
}

/** 画像の座標（520x400）→ 画面の座標 */
async function mapper(page: Page) {
  const box = await page.getByRole("application", { name: "注釈の編集面" }).boundingBox();
  if (box === null) throw new Error("編集面がない");
  const k = Math.min(box.width / 520, box.height / 400);
  return (p: readonly [number, number]) =>
    [
      box.x + (box.width - 520 * k) / 2 + p[0] * k,
      box.y + (box.height - 400 * k) / 2 + p[1] * k,
    ] as const;
}

/** 押して動かす（離さない）。離すのは呼び出し側 */
async function press(page: Page, from: [number, number], to: [number, number]) {
  const at = await mapper(page);
  await page.mouse.move(...at(from));
  await page.mouse.down();
  await page.mouse.move(...at([(from[0] + to[0]) / 2, (from[1] + to[1]) / 2]));
  await page.mouse.move(...at(to));
}

async function drag(page: Page, from: [number, number], to: [number, number]) {
  await press(page, from, to);
  await page.mouse.up();
}

const rects = (page: Page) => page.locator(".harie-canvas-image rect");
const num = async (page: Page, i: number, name: string) =>
  Number(await rects(page).nth(i).getAttribute(name));

test("FR-EDIT-22: 動かす・描くときはほかの図形の端・中央にそろい、ガイド線を出す。⌘ / Ctrl を押すと吸着しない", async ({
  page,
}) => {
  await open(page);
  await page.keyboard.press("r");
  await drag(page, [40, 40], [200, 140]);
  await expect(rects(page)).toHaveCount(1);
  const top = await num(page, 0, "y");

  // 少しずれた高さから描き始めても、1 つ目の四角の上端にそろう
  await drag(page, [300, top + 2], [420, 180]);
  await expect(rects(page)).toHaveCount(2);
  expect(await num(page, 1, "y")).toBe(top);

  // 動かしている間はガイド線を出し、1 つ目の四角の下端にそろえる
  await page.keyboard.press("v");
  const bottom = top + (await num(page, 0, "height"));
  const second = { y: await num(page, 1, "y") };
  const grip: [number, number] = [360, second.y + 20];
  await press(page, grip, [360, grip[1] + (bottom - second.y) + 2]);
  await expect(page.locator(".harie-snap-guides [data-guide='y']").first()).toBeAttached();
  await page.mouse.up();
  await expect(page.locator(".harie-snap-guides")).toHaveCount(0);
  expect(await num(page, 1, "y")).toBe(bottom);

  // Ctrl（Mac は ⌘）を押している間は吸着しない
  await page.keyboard.down("Control");
  // 上端を画像の中央（200）の 2px 下へ。吸着すれば 200 になる
  await drag(page, [360, bottom + 20], [360, 202 + 20]);
  await page.keyboard.up("Control");
  expect(await num(page, 1, "y")).toBe(202);
});

test("FR-EDIT-22: 矢印の端は図形の中央・辺の中点に吸い付く", async ({ page }) => {
  await open(page);
  await page.keyboard.press("r");
  await drag(page, [40, 40], [200, 140]);
  const x = await num(page, 0, "x");
  const y = await num(page, 0, "y");
  const w = await num(page, 0, "width");
  const h = await num(page, 0, "height");
  const right: [number, number] = [x + w, y + h / 2];

  await page.keyboard.press("a");
  await press(page, [320, 300], [right[0] + 3, right[1] - 3]);
  await expect(page.locator(".harie-snap-guides [data-guide='anchor']")).toBeVisible();
  await page.mouse.up();

  // 描いた矢印は選ばれていて、終点のつまみが四角の右辺の中点にある
  const handle = page.locator(".harie-handle-to");
  const hx =
    Number(await handle.getAttribute("x")) + Number(await handle.getAttribute("width")) / 2;
  const hy =
    Number(await handle.getAttribute("y")) + Number(await handle.getAttribute("height")) / 2;
  expect(hx).toBeCloseTo(right[0], 5);
  expect(hy).toBeCloseTo(right[1], 5);
});
