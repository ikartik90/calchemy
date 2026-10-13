#!/usr/bin/env node
import { init } from "./init";

// `npx @calchemy/date-jev init` asks for the developer's TypeSafe key without showing it and saves
// it to the project's .env. Installing date-jev runs nothing; this runs only when asked.
const Usage = `Usage: npx @calchemy/date-jev init

Saves your TypeSafe API key to this project's .env and keeps .env out of git.`;

const [command] = process.argv.slice(2);
if (command !== "init") {
  console.log(Usage);
  process.exit(command === undefined || command === "--help" || command === "-h" ? 0 : 1);
}

try {
  const saved = await init({
    cwd: process.cwd(),
    readKey: () => readHiddenLine("Paste your TypeSafe API key (it won't be shown): "),
    log: (line) => console.log(line),
  });
  process.exit(saved ? 0 : 1);
} catch (error) {
  console.log(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

// Example: `await readHiddenLine("Key: ")` returns what the developer types or pastes, echoing
// nothing. Without a terminal, as in `npx @calchemy/date-jev init < key.txt`, it reads the first line.
function readHiddenLine(prompt: string): Promise<string> {
  const { stdin, stdout } = process;
  if (!stdin.isTTY) {
    return readFirstLine();
  }

  stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.setEncoding("utf8");
  stdin.resume();

  return new Promise((resolve, reject) => {
    let value = "";
    const finish = () => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
    };
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n") {
          finish();
          resolve(value);
          return;
        }
        if (char === "\u0003" || char === "\u0004") {
          finish();
          reject(new Error("Cancelled. Nothing was saved."));
          return;
        }
        value = char === "\u007f" || char === "\b" ? value.slice(0, -1) : value + char;
      }
    };
    stdin.on("data", onData);
  });
}

async function readFirstLine(): Promise<string> {
  let text = "";
  for await (const chunk of process.stdin) {
    text += String(chunk);
    if (text.includes("\n")) {
      break;
    }
  }

  return text.split(/\r?\n/)[0] ?? "";
}
