import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "skill",
    // MCP サーバーを子プロセスで起動するので、既定より長く待つ
    testTimeout: 60_000,
  },
});
