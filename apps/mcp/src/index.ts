// MCP サーバー（stdio）の入口。操作できるのは --root 配下だけ（既定はカレントディレクトリ）
import { parseArgs } from "node:util";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server";

const { values } = parseArgs({ options: { root: { type: "string" } } });
const server = createServer({ root: values.root ?? process.cwd() });
await server.connect(new StdioServerTransport());
// stdout は MCP の通信に使うので、ログは stderr に出す
console.error(`harie MCP server: root=${values.root ?? process.cwd()}`);
