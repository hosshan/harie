// 操作できるのは起動時に許可したディレクトリ（root）配下だけ（docs/03-design/integrations.md 2.1）
import { existsSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

export class PathError extends Error {}

/** 実在する最も近い祖先までシンボリックリンクを解決する（まだ無い出力先にも使えるように）。 */
function realpathLoose(p: string): string {
  let current = p;
  const rest: string[] = [];
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) break;
    rest.unshift(current.slice(parent.length + 1));
    current = parent;
  }
  return resolve(realpathSync(current), ...rest);
}

export type RootGuard = {
  root: string;
  /** root からの相対パス・絶対パスを受け取り、root 配下の絶対パスを返す。外なら PathError。 */
  resolve(path: string): string;
  /** 利用者に見せるための root からの相対パス */
  display(absolute: string): string;
};

export function createRootGuard(root: string): RootGuard {
  const realRoot = realpathSync(resolve(root));
  return {
    root: realRoot,
    resolve(path) {
      const absolute = realpathLoose(isAbsolute(path) ? path : resolve(realRoot, path));
      const rel = relative(realRoot, absolute);
      if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
        throw new PathError(`許可されたディレクトリ（${realRoot}）の外は扱えません: ${path}`);
      }
      return absolute;
    },
    display(absolute) {
      return relative(realRoot, absolute) || ".";
    },
  };
}
