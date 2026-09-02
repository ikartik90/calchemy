import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@calchemy/date-core": new URL("./packages/date-core/src/index.ts", import.meta.url).pathname,
    },
  },
  test: {
    environment: "node",
    include: ["packages/*/tests/**/*.test.ts"],
  },
});
