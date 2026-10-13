import { parseArgs } from "node:util";
import { CliError, create, extract, inspect, mask, render } from "./commands";

const USAGE = `harie — Harie ファイルの開発用 CLI

使い方:
  harie inspect <file> [--json]                 ファイルの状態・注釈の概要を表示する
  harie create <image> [-o out] [--title t] [--format jpeg|png]
                                               普通の画像から Harie ファイルを作る（既定は元画像と同じ形式）
  harie render <file> [--doc doc.json] [-o out] 注釈（または JSON）で描き直す。-o 省略時は上書き
  harie extract <file> [--doc out.json] [--base out.jpg]
                                               注釈 JSON とベース画像を取り出す
  harie mask <file> --rect x,y,w,h --method fill|mosaic|blur|replace --kind <種別> [--text ダミー] [-o out]
                                               PII 加工をベース画像に不可逆に適用する（元に戻せない）`;

export async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      out: { type: "string", short: "o" },
      json: { type: "boolean" },
      title: { type: "string" },
      format: { type: "string" },
      doc: { type: "string" },
      base: { type: "string" },
      rect: { type: "string" },
      method: { type: "string" },
      kind: { type: "string", default: "other" },
      text: { type: "string" },
      color: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  const [command, file] = positionals;
  const opt = <K extends keyof typeof values>(k: K) =>
    values[k] === undefined
      ? {}
      : ({ [k]: values[k] } as { [P in K]: NonNullable<(typeof values)[K]> });
  try {
    if (values.help || command === undefined) {
      console.log(USAGE);
      return 0;
    }
    if (file === undefined) throw new CliError("ファイルを指定してください");
    switch (command) {
      case "inspect":
        console.log(inspect(file, opt("json")));
        return 0;
      case "create":
        console.log(
          `作成: ${await create(file, { ...opt("out"), ...opt("title"), ...opt("format") })}`,
        );
        return 0;
      case "render":
        console.log(`保存: ${await render(file, { ...opt("out"), ...opt("doc") })}`);
        return 0;
      case "extract":
        for (const p of extract(file, { ...opt("doc"), ...opt("base") }))
          console.log(`書き出し: ${p}`);
        return 0;
      case "mask": {
        if (values.rect === undefined || values.method === undefined) {
          throw new CliError("--rect と --method を指定してください");
        }
        const out = await mask(file, {
          rect: values.rect,
          method: values.method,
          kind: values.kind,
          ...opt("text"),
          ...opt("color"),
          ...opt("out"),
        });
        console.log(`保存: ${out}（加工前のベース画像は残していません）`);
        return 0;
      }
      default:
        throw new CliError(`不明なコマンド: ${command}\n\n${USAGE}`);
    }
  } catch (e) {
    if (e instanceof CliError) {
      console.error(`エラー: ${e.message}`);
      return 1;
    }
    throw e;
  }
}
