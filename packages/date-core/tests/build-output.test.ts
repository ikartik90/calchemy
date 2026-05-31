import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

const testDir = dirname(fileURLToPath(import.meta.url));
const distIndexPath = resolve(testDir, "../dist/index.js");

describe("date-core build output", () => {
  test("keeps the Temporal polyfill as a dynamic fallback import", () => {
    const distIndex = readFileSync(distIndexPath, "utf8");

    expect(distIndex).toContain('await import("@js-temporal/polyfill")');
  });
});

