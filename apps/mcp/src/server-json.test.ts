import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (name: string) =>
  JSON.parse(readFileSync(new URL(`../${name}`, import.meta.url), "utf8"));

describe("MCP Registry の server.json", () => {
  it("FR-MCP-01: name が package.json の mcpName と、パッケージ名が package.json の name と一致する", () => {
    const pkg = read("package.json");
    const server = read("server.json");
    expect(server.name).toBe(pkg.mcpName);
    expect(server.packages[0].identifier).toBe(pkg.name);
    expect(server.description.length).toBeLessThanOrEqual(100);
  });
});
