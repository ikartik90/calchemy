import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type InitOptions = {
  /** The project folder: the one with package.json. */
  cwd: string;
  /** Asks the developer for their TypeSafe key. The CLI reads it from the terminal without showing it. */
  readKey: () => Promise<string>;
  log: (line: string) => void;
};

const KeyName = "TYPESAFE_API_KEY";

// Example: `await init({ cwd, readKey, log })` saves the key to `cwd/.env`, adds `.env` to
// `cwd/.gitignore`, and returns true. The developer runs it on purpose with
// `npx @calchemy/date-jev init`; the library itself never reads the key. Messages name the file,
// never the key.
export async function init({ cwd, readKey, log }: InitOptions): Promise<boolean> {
  if (!existsSync(join(cwd, "package.json"))) {
    log("Run this from your project's folder, the one with package.json. Nothing was saved.");
    return false;
  }

  const envFile = join(cwd, ".env");
  const env = existsSync(envFile) ? readFileSync(envFile, "utf8") : null;
  if (env !== null && new RegExp(`^\\s*${KeyName}\\s*=`, "m").test(env)) {
    log(`${KeyName} is already in .env, so it was left as it is. Edit .env to change it.`);
  } else {
    const key = (await readKey()).trim();
    if (!/^[^\s"'`#=]+$/.test(key)) {
      log("That key is empty or has spaces or quotes in it, so nothing was saved.");
      return false;
    }

    // A new .env is readable only by its owner; an existing one keeps its permissions.
    writeFileSync(envFile, `${withNewline(env ?? "")}${KeyName}=${key}\n`, env === null ? { mode: 0o600 } : {});
    log(`Saved ${KeyName} to .env.`);
  }

  ignoreEnvFile(join(cwd, ".gitignore"), log);
  return true;
}

function ignoreEnvFile(gitignoreFile: string, log: InitOptions["log"]): void {
  const gitignore = existsSync(gitignoreFile) ? readFileSync(gitignoreFile, "utf8") : "";
  const ignored = gitignore.split(/\r?\n/).some((line) => line.trim() === ".env" || line.trim() === "/.env");
  if (!ignored) {
    writeFileSync(gitignoreFile, `${withNewline(gitignore)}.env\n`);
    log("Added .env to .gitignore, so the key stays out of git.");
  }
}

function withNewline(text: string): string {
  return text === "" || text.endsWith("\n") ? text : `${text}\n`;
}
