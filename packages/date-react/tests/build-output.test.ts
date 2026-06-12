import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

const testDir = dirname(fileURLToPath(import.meta.url));
const distIndexEsmPath = resolve(testDir, "../dist/index.js");
const distIndexCjsPath = resolve(testDir, "../dist/index.cjs");
const distCalendarScrollEsmPath = resolve(testDir, "../dist/calendar-scroll.js");
const distCalendarScrollCjsPath = resolve(testDir, "../dist/calendar-scroll.cjs");

describe("date-react build output", () => {
  test("keeps react-dom out of the main ESM entry", () => {
    const distIndex = readFileSync(distIndexEsmPath, "utf8");

    expect(distIndex).not.toContain("react-dom");
  });

  test("keeps react-dom out of the main CJS entry", () => {
    const distIndex = readFileSync(distIndexCjsPath, "utf8");

    expect(distIndex).not.toContain("react-dom");
  });

  test("keeps react-dom as an external import on the calendar-scroll ESM entry", () => {
    const distCalendarScroll = readFileSync(distCalendarScrollEsmPath, "utf8");

    expect(distCalendarScroll).toContain('from "react-dom"');
  });

  test("keeps react-dom as an external require on the calendar-scroll CJS entry", () => {
    const distCalendarScroll = readFileSync(distCalendarScrollCjsPath, "utf8");

    expect(distCalendarScroll).toContain('require("react-dom")');
  });
});
