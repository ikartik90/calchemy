import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

const testDir = dirname(fileURLToPath(import.meta.url));
const distIndexPath = resolve(testDir, "../dist/index.js");
const distCalendarScrollPath = resolve(testDir, "../dist/calendar-scroll.js");

describe("date-react build output", () => {
  test("keeps react-dom out of the main entry", () => {
    const distIndex = readFileSync(distIndexPath, "utf8");

    expect(distIndex).not.toContain("react-dom");
  });

  test("keeps react-dom as an external import on the calendar-scroll entry", () => {
    const distCalendarScroll = readFileSync(distCalendarScrollPath, "utf8");

    expect(distCalendarScroll).toContain('from "react-dom"');
  });
});
