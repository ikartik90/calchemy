import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

const testDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(testDir, "..");
const distDir = join(packageDir, "dist");
const srcDir = join(packageDir, "src");

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

describe("date-core build output", () => {
  test("keeps the Temporal polyfill as a dynamic fallback import", () => {
    const distIndex = readFileSync(join(distDir, "index.js"), "utf8");

    expect(distIndex).toContain('await import("@js-temporal/polyfill")');
  });

  // `files: ["dist"]` ships everything under dist, so anything left there from
  // an earlier layout — or emitted by a typecheck — goes to npm too.
  test("ships only the bundle as JavaScript", () => {
    const javascript = walk(distDir)
      .filter((file) => file.endsWith(".js"))
      .map((file) => relative(distDir, file));

    expect(javascript).toEqual(["index.js"]);
  });

  test("ships a declaration only for modules that still exist in src", () => {
    const orphans = walk(distDir)
      .filter((file) => file.endsWith(".d.ts"))
      .map((file) => relative(distDir, file).replace(/\.d\.ts$/, ""))
      .filter((module) => !existsSync(join(srcDir, `${module}.ts`)));

    expect(orphans).toEqual([]);
  });
});
