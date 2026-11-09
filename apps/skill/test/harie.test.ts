// Harie Skill のコマンド（FR-MCP-09）。npm から取らず、リポジトリの MCP サーバーのソースを tsx で起動して確かめる
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateSync } from "node:zlib";
import {
  GUIDE_LAYOUT_RULES,
  GUIDE_TARGET_RULE,
  GUIDE_TEXT_RULES,
  PII_KIND_RULE,
} from "@harie/ai/guide";
import { beforeAll, describe, expect, it } from "vitest";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const SCRIPT = here("../skills/harie/scripts/harie.mjs");
const SERVER = here("../../mcp/src/index.ts");
const TSX = import.meta.resolve("tsx");

/** 単色の PNG（テスト用。実在の画面は使わない） */
function solidPng(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // ビット深度
  ihdr[9] = 2; // RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0xf0)]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

let dir: string;

function harie(...args: string[]) {
  return run({ HARIE_OUT_DIR: dir }, ...args);
}

function run(extraEnv: Record<string, string>, ...args: string[]) {
  const env: Record<string, string | undefined> = {
    ...process.env,
    HARIE_MCP_COMMAND: JSON.stringify(["node", "--import", TSX, SERVER]),
    ...extraEnv,
  };
  if (!("HARIE_OUT_DIR" in extraEnv)) delete env.HARIE_OUT_DIR;
  const r = spawnSync("node", [SCRIPT, ...args], { cwd: dir, encoding: "utf8", env });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

const json = (stdout: string) => JSON.parse(stdout);

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "harie-skill-"));
  // 貼り付けた画像のように、拡張子のないファイルとして置く
  writeFileSync(join(dir, "0b6f5d1e-2c4a-4e8b-9a77-1f3c5d7e9a01"), solidPng(320, 200));
});

describe("Harie Skill（FR-MCP-09）", () => {
  let file: string;

  it("find は拡張子のない画像も PNG と判定して見つける", () => {
    const r = harie("find", dir);
    expect(r.code).toBe(0);
    const [image] = json(r.stdout).result.images;
    expect(image).toMatchObject({ format: "png", size: "320x200", harie: false });
  });

  it("import は拡張子のない画像から Harie ファイルを作り、絶対パスを返す", () => {
    const r = harie("import", join(dir, "0b6f5d1e-2c4a-4e8b-9a77-1f3c5d7e9a01"), "--title", "設定");
    expect(r.code, r.stderr).toBe(0);
    const out = json(r.stdout);
    file = out.result.path;
    expect(file.startsWith(dir)).toBe(true);
    expect(file).toMatch(/screenshot-.*\.harie\.png$/);
    expect(out.result).toMatchObject({ revision: 1, title: "設定", annotations: [] });
    expect(out.view).toBeUndefined();
  });

  it("preview は画像を書き出すだけで、ファイルを変えない", () => {
    const before = readFileSync(file);
    const view = join(dir, "view.png");
    const ops = [{ op: "add", annotation: { id: "r1", type: "rect", x: 10, y: 10, w: 80, h: 40 } }];
    const r = harie("preview", file, "--ops", JSON.stringify(ops), "--view", view);
    expect(r.code, r.stderr).toBe(0);
    expect(json(r.stdout).view).toBe(view);
    expect(existsSync(view)).toBe(true);
    expect(readFileSync(file).equals(before)).toBe(true);
  });

  it("edit は保存し、画像は返さない。open で注釈を JSON で読める", () => {
    const ops = [
      { op: "add", annotation: { id: "r1", type: "rect", x: 10, y: 10, w: 80, h: 40 } },
      {
        op: "add",
        annotation: {
          id: "b1",
          type: "badge",
          x: 0,
          y: 0,
          number: 1,
          anchor: { annotationId: "r1" },
        },
      },
    ];
    const opsFile = join(dir, "ops.json");
    writeFileSync(opsFile, JSON.stringify(ops));
    const r = harie("edit", file, "--ops", `@${opsFile}`, "--rev", "1");
    expect(r.code, r.stderr).toBe(0);
    expect(json(r.stdout).result.revision).toBe(2);
    expect(json(r.stdout).view).toBeUndefined();

    const opened = json(harie("open", file).stdout).result;
    expect(opened.annotations.map((a: { id: string }) => a.id)).toEqual(["r1", "b1"]);
  });

  it("edit は revision が合わなければ失敗する", () => {
    const r = harie("edit", file, "--ops", "[]", "--rev", "1");
    expect(r.code).toBe(1);
    expect(json(r.stdout).ok).toBe(false);
  });

  it("mask は --confirm がなければ保存しない", () => {
    const before = readFileSync(file);
    const masks = [{ kind: "name", method: "fill", rect: { x: 100, y: 100, w: 50, h: 20 } }];
    const r = harie("mask", file, "--masks", JSON.stringify(masks));
    expect(r.code, r.stderr).toBe(0);
    expect(json(r.stdout).result.saved).toBe(false);
    expect(existsSync(json(r.stdout).view)).toBe(true);
    expect(readFileSync(file).equals(before)).toBe(true);
  });

  it("guide は手引きを表示する", () => {
    const r = harie("guide", file, "--intent", "通知の設定");
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toContain("説明したいこと: 通知の設定");
  });

  it("import は拡張子のある画像なら、既定で同じフォルダに作る", () => {
    const sub = mkdtempSync(join(tmpdir(), "harie-skill-src-"));
    writeFileSync(join(sub, "settings.png"), solidPng(64, 48));
    const r = run({}, "import", join(sub, "settings.png"));
    expect(r.code, r.stderr).toBe(0);
    expect(json(r.stdout).result.path).toBe(join(sub, "settings.harie.png"));
  });

  it("JPEG / PNG 以外は import できない", () => {
    const webp = join(dir, "a.webp");
    writeFileSync(webp, Buffer.from("RIFF\0\0\0\0WEBPVP8 ", "ascii"));
    const r = harie("import", webp);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("JPEG / PNG");
  });
});

describe("SKILL.md の手引き（FR-MCP-08 と同じ基準）", () => {
  const skill = readFileSync(here("../skills/harie/SKILL.md"), "utf8");

  it("注釈の決まりが @harie/ai/guide と一致する", () => {
    const block = /<!-- guide:start -->\n([\s\S]*?)<!-- guide:end -->/.exec(skill)?.[1];
    const expected = [GUIDE_TARGET_RULE, ...GUIDE_TEXT_RULES, ...GUIDE_LAYOUT_RULES]
      .map((r) => `- ${r}\n`)
      .join("");
    expect(block, "SKILL.md の guide:start〜guide:end をこの内容にしてください").toBe(expected);
  });

  it("個人情報の種類が @harie/ai/guide と一致する", () => {
    expect(skill).toContain(`- ${PII_KIND_RULE}\n`);
  });
});

describe("配布物", () => {
  it("package は harie フォルダを最上位にした .skill（zip）を作る", () => {
    execFileSync("node", [here("../scripts/pack.mjs")], { cwd: here("..") });
    const zip = readFileSync(here("../dist/harie.skill"));
    expect(zip.includes("harie/SKILL.md")).toBe(true);
    expect(zip.includes("harie/scripts/harie.mjs")).toBe(true);
  });

  it("SKILL.md の name とマーケットプレイスの登録がそろっている", () => {
    const skill = readFileSync(here("../skills/harie/SKILL.md"), "utf8");
    expect(skill).toMatch(/^---\nname: harie\ndescription: .+\n---\n/);
    const description = /description: (.+)/.exec(skill)?.[1] ?? "";
    expect(description.length).toBeLessThanOrEqual(1024);
    const market = JSON.parse(
      readFileSync(here("../../../.claude-plugin/marketplace.json"), "utf8"),
    );
    const plugin = JSON.parse(readFileSync(here("../.claude-plugin/plugin.json"), "utf8"));
    expect(market.plugins).toContainEqual(
      expect.objectContaining({ name: plugin.name, source: "./apps/skill" }),
    );
  });
});
