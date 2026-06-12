import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

const testDir = dirname(fileURLToPath(import.meta.url));
const distIndexEsmPath = resolve(testDir, "../dist/index.js");
const distIndexCjsPath = resolve(testDir, "../dist/index.cjs");

describe("date-core build output", () => {
  test("keeps the Temporal polyfill as a dynamic fallback import in ESM", () => {
    const distIndex = readFileSync(distIndexEsmPath, "utf8");

    expect(distIndex).toContain('await import("@js-temporal/polyfill")');
  });

  test("keeps the Temporal polyfill as a dynamic fallback import in CJS", () => {
    const distIndex = readFileSync(distIndexCjsPath, "utf8");

    expect(distIndex).toContain('await import("@js-temporal/polyfill")');
  });
});
