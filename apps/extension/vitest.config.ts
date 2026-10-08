import { defineProject } from "vitest/config";

export default defineProject({
  resolve: { alias: { "@": new URL(".", import.meta.url).pathname } },
  test: {
    name: "extension",
    include: ["lib/**/*.test.ts"],
  },
});
