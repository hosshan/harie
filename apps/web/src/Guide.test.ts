import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { MCP_COMMAND, MCP_DESKTOP_CONFIG } from "./Guide";

const readme = readFileSync(new URL("../../mcp/README.md", import.meta.url), "utf8");

test("FR-MCP-07: 案内する MCP の登録方法が apps/mcp/README.md と食い違わない", () => {
  expect(readme).toContain(MCP_COMMAND);
  expect(readme).toContain(MCP_DESKTOP_CONFIG);
});
