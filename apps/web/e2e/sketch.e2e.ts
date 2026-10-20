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
}

/** 画像の座標（520x400）で、点を順になぞる */
async function trace(page: Page, points: readonly (readonly [number, number])[]) {
  const box = await page.getByRole("application", { name: "注釈の編集面" }).boundingBox();
  if (box === null) throw new Error("編集面がない");
  const k = Math.min(box.width / 520, box.height / 400);
  const at = (p: readonly [number, number]) =>
    [
      box.x + (box.width - 520 * k) / 2 + p[0] * k,
      box.y + (box.height - 400 * k) / 2 + p[1] * k,
    ] as const;
  const [first, ...rest] = points;
  if (first === undefined) return;
  await page.mouse.move(...at(first));
  await page.mouse.down();
  for (const p of rest) await page.mouse.move(...at(p));
  await page.mouse.up();
}

function circle(cx: number, cy: number, r: number): [number, number][] {
  return Array.from({ length: 41 }, (_, i) => {
    const t = (i / 40) * Math.PI * 2;
    return [cx + r * Math.cos(t) + Math.sin(i) * 2, cy + r * 0.7 * Math.sin(t)];
  });
}

function lineTo(from: [number, number], to: [number, number], n = 10): [number, number][] {
  return Array.from({ length: n + 1 }, (_, i) => [
    from[0] + ((to[0] - from[0]) * i) / n,
    from[1] + ((to[1] - from[1]) * i) / n,
  ]);
}

test("FR-EDIT-13: なぞった線から近い図形を描き、どれにも当たらなければ何も追加しない", async ({
  page,
}) => {
  await open(page);
  await page.keyboard.press("p");
  await expect(page.getByRole("button", { name: "スケッチ" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // 丸くなぞると楕円になり、選ばれる。道具はスケッチのまま
  await trace(page, circle(150, 150, 80));
  await expect(page.locator(".harie-canvas-image ellipse")).toHaveCount(1);
  await expect(page.locator("[data-selected^='ellipse-']")).toHaveCount(1);
  await expect(page.getByRole("toolbar")).toHaveAttribute("data-hidden", "false");

  // 四角くなぞると四角になる
  await trace(page, [
    ...lineTo([300, 60], [480, 62]),
    ...lineTo([480, 62], [478, 180]),
    ...lineTo([478, 180], [302, 178]),
    ...lineTo([302, 178], [300, 64]),
  ]);
  await expect(page.locator(".harie-canvas-image rect")).toHaveCount(1);

  // 軸のあとで折り返すと矢印になる
  await trace(page, [...lineTo([60, 360], [260, 260]), ...lineTo([260, 260], [225, 262], 4)]);
  await expect(page.locator(".harie-canvas-image line")).toHaveCount(1);

  // クリックすると選択を外し、図形をクリックするとその図形を選ぶ。道具はスケッチのまま
  await trace(page, [[20, 380]]);
  await expect(page.locator(".harie-selection")).toHaveCount(0);
  await trace(page, [[150, 150]]);
  await expect(page.locator("[data-selected^='ellipse-']")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "スケッチ" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // 選んだ図形は、スケッチの道具のままつまみで大きさを変え、掴んで動かせる
  const ellipseEl = page.locator(".harie-canvas-image ellipse");
  const rx = async () => Number(await ellipseEl.getAttribute("rx"));
  const cx = async () => Number(await ellipseEl.getAttribute("cx"));
  const rx0 = await rx();
  const handle = page.locator(".harie-handle-e");
  const hb = await handle.boundingBox();
  if (hb === null) throw new Error("つまみがない");
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2 + 20, hb.y + hb.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect.poll(rx).toBeGreaterThan(rx0 + 5);
  const cx0 = await cx();
  await trace(page, lineTo([150, 150], [170, 150], 4));
  await expect.poll(cx).toBeGreaterThan(cx0 + 10);
  await expect(page.locator(".harie-canvas-image ellipse")).toHaveCount(1);

  // 三角はどれにも当たらない。案内を出し、注釈は増やさない
  await trace(page, [
    ...lineTo([380, 250], [480, 380]),
    ...lineTo([480, 380], [280, 380]),
    ...lineTo([280, 380], [380, 252]),
  ]);
  await expect(
    page.getByRole("status").filter({ hasText: "図形として読み取れませんでした" }),
  ).toBeVisible();
  await expect(page.locator(".harie-canvas-image ellipse")).toHaveCount(1);
  await expect(page.locator(".harie-canvas-image rect")).toHaveCount(1);

  // 動かす・大きさを変える・なぞる、を 1 回ずつ元に戻せる
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(cx).toBe(cx0);
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(rx).toBe(rx0);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator(".harie-canvas-image line")).toHaveCount(0);
});
