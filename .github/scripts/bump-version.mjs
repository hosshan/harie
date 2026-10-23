// リリース対象の package.json の version を上げ、新しい版を出力する（release-prepare.yml から使う）
// 使い方: node .github/scripts/bump-version.mjs <package.json のパス> <patch|minor|major> [明示する版]
import { readFileSync, writeFileSync } from "node:fs";

const [path, bump, explicit] = process.argv.slice(2);
const semver = /^(\d+)\.(\d+)\.(\d+)$/;

const pkg = JSON.parse(readFileSync(path, "utf8"));
const current = semver.exec(pkg.version);
if (current === null)
  throw new Error(`${path} の version (${pkg.version}) が x.y.z 形式ではありません`);
const [major, minor, patch] = current.slice(1).map(Number);

let next;
if (explicit) {
  const m = semver.exec(explicit);
  if (m === null) throw new Error(`指定した版 (${explicit}) が x.y.z 形式ではありません`);
  const [a, b, c] = m.slice(1).map(Number);
  const newer = a !== major ? a > major : b !== minor ? b > minor : c > patch;
  if (!newer)
    throw new Error(`指定した版 (${explicit}) が今の版 (${pkg.version}) より新しくありません`);
  next = explicit;
} else if (bump === "major") next = `${major + 1}.0.0`;
else if (bump === "minor") next = `${major}.${minor + 1}.0`;
else if (bump === "patch") next = `${major}.${minor}.${patch + 1}`;
else throw new Error(`bump は patch / minor / major のいずれか (${bump})`);

pkg.version = next;
writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(next);
