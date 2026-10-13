import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { init } from "../src/init";

// A made-up key: these tests must never see a real one.
const key = "ts_test_4f9a2c";

let project: string;
let lines: string[];

beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), "date-jev-init-"));
  writeFileSync(join(project, "package.json"), "{}\n");
  lines = [];
});

afterEach(() => {
  rmSync(project, { recursive: true, force: true });
});

function run(readKey: () => Promise<string> = async () => key) {
  return init({ cwd: project, readKey, log: (line) => lines.push(line) });
}

function read(file: string): string {
  return readFileSync(join(project, file), "utf8");
}

describe("init", () => {
  test("saves the key to .env and keeps .env out of git", async () => {
    expect(await run()).toBe(true);

    expect(read(".env")).toBe(`TYPESAFE_API_KEY=${key}\n`);
    expect(read(".gitignore")).toBe(".env\n");
  });

  test("keeps what .env and .gitignore already hold", async () => {
    writeFileSync(join(project, ".env"), "DATABASE_URL=postgres://localhost/app");
    writeFileSync(join(project, ".gitignore"), "node_modules\ndist\n");

    await run();

    expect(read(".env")).toBe(`DATABASE_URL=postgres://localhost/app\nTYPESAFE_API_KEY=${key}\n`);
    expect(read(".gitignore")).toBe("node_modules\ndist\n.env\n");
  });

  test("does not list .env in .gitignore twice", async () => {
    writeFileSync(join(project, ".gitignore"), "/.env\n");

    await run();

    expect(read(".gitignore")).toBe("/.env\n");
  });

  test("leaves a key already in .env alone, without asking for another", async () => {
    writeFileSync(join(project, ".env"), "TYPESAFE_API_KEY=ts_existing\n");

    expect(await run(async () => expect.unreachable("asked for a key"))).toBe(true);

    expect(read(".env")).toBe("TYPESAFE_API_KEY=ts_existing\n");
    expect(read(".gitignore")).toBe(".env\n");
    expect(lines.join("\n")).toContain("already");
  });

  test.each(["", "   ", "ts key with spaces", 'ts_"quoted"'])("saves nothing for the key %j", async (bad) => {
    expect(await run(async () => bad)).toBe(false);

    expect(() => read(".env")).toThrow();
    expect(() => read(".gitignore")).toThrow();
  });

  test("never prints the key", async () => {
    await run();

    expect(lines.length).toBeGreaterThan(0);
    expect(lines.join("\n")).not.toContain(key);
  });

  test("makes a new .env readable only by its owner", async () => {
    await run();

    expect(statSync(join(project, ".env")).mode & 0o777).toBe(0o600);
  });

  test("refuses to run outside a project folder", async () => {
    rmSync(join(project, "package.json"));

    expect(await run(async () => expect.unreachable("asked for a key"))).toBe(false);

    expect(() => read(".env")).toThrow();
  });
});
