#!/usr/bin/env node

// Records live Jev answers for date-jev's tests, using your own TypeSafe key from the project's `.env`.
//
//   pnpm record-jev                       re-records every phrase in packages/date-jev/tests/recordings
//   pnpm record-jev "next friday" tuesday records only these phrases
//
// The script builds its own client and hands it to date-jev, as any app would. Only the request
// body and Jev's answers are saved; the key never leaves the client's Authorization header.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { TypeSafeClient } from "@typesafe-ai/sdk";

const recordingsDir = new URL("../packages/date-jev/tests/recordings/", import.meta.url);

if (!process.env.TYPESAFE_API_KEY) {
  console.error("TYPESAFE_API_KEY is missing. Save your key to the project's .env first.");
  process.exit(1);
}

const { createJevParser } = await import(new URL("../packages/date-jev/dist/index.js", import.meta.url));
const phrases = process.argv.length > 2 ? process.argv.slice(2) : recordedPhrases();
let failures = 0;

for (const phrase of phrases) {
  const exchange = {};
  const client = new TypeSafeClient({
    apiKey: process.env.TYPESAFE_API_KEY,
    fetch: async (url, init) => {
      exchange.request = JSON.parse(String(init.body));
      const response = await fetch(url, init);
      exchange.response = await response.clone().json();
      return response;
    },
  });

  try {
    const jev = await createJevParser({ client });
    await jev.parseDate(phrase);
  } catch (error) {
    failures += 1;
    console.error(`✗ ${phrase}: ${error instanceof Error ? error.message : String(error)}`);
    continue;
  }

  const recording = {
    phrase,
    recordedAt: new Date().toISOString().slice(0, 10),
    request: exchange.request,
    response: exchange.response,
  };
  writeFileSync(new URL(recordingFile(phrase), recordingsDir), `${JSON.stringify(recording, null, 2)}\n`);
  console.log(`✓ ${phrase.padEnd(16)} ${summarize(exchange.response)}`);
}

process.exit(failures > 0 ? 1 : 0);

// Example: `recordingFile("next friday")` returns `next-friday.json`. Matches tests/support/replay.ts.
function recordingFile(phrase) {
  return `${phrase.replaceAll(" ", "-")}.json`;
}

function recordedPhrases() {
  return readdirSync(recordingsDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => {
      const recording = JSON.parse(readFileSync(new URL(file, recordingsDir), "utf8"));
      return recording.phrase ?? file.slice(0, -".json".length).replaceAll("-", " ");
    });
}

// Example: `summarize(response)` returns `day=weekday (0.95)  weekday=friday (0.98)  [jev-1.13.0]`.
function summarize(response) {
  const answers = Object.entries(response.answers).map(([name, answer]) =>
    answer.type === "noul" ? `${name}=${answer.noul.toFixed(2)}` : `${name}=${answer.choice} (${answer.confidence.toFixed(2)})`,
  );
  return `${answers.join("  ")}  [${response.model}]`;
}
