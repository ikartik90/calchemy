#!/usr/bin/env node

// Runs the same phrases through date-core and date-jev and lists where they disagree.
//
//   pnpm compare-engines                          phrases from scripts/compare-phrases.txt
//   pnpm compare-engines "next friday" fri        only these phrases
//   pnpm compare-engines --reference-date 2026-10-12
//   pnpm compare-engines --fresh                  ask Jev again instead of reusing cached answers
//
// Both parsers share date-core's date math, so a disagreement points at how one of them read the
// phrase. Jev's answers are cached in node_modules/.cache/calchemy-jev, keyed by the exact request,
// so re-runs are free and stable until date-jev's questions change. Live calls use your own key
// from the project's .env.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { TypeSafeClient } from "@typesafe-ai/sdk";

const { createCalchemy, toJSON } = await import(new URL("../packages/date-core/dist/index.js", import.meta.url));
const { createJevParser } = await import(new URL("../packages/date-jev/dist/index.js", import.meta.url));

const DefaultReferenceDate = "2026-05-27"; // the reference date of date-core's pinned corpus
const cacheDir = new URL("../node_modules/.cache/calchemy-jev/", import.meta.url);
const VerdictOrder = ["disagree", "jev error", "date-core ambiguous", "only date-jev", "only date-core", "neither", "agree"];
const { phrases, referenceDate, fresh } = parseArgs(process.argv.slice(2));

let lastJevResponse = null;
const client = new TypeSafeClient({
  apiKey: process.env.TYPESAFE_API_KEY ?? "cache-only",
  fetch: cachedFetch,
});

const calchemy = await createCalchemy();
const jev = await createJevParser({ client });
const context = {
  referenceDate: calchemy.Temporal.PlainDate.from(referenceDate),
  locale: "en-US",
  weekStartsOn: 0,
};

const rows = [];
for (const phrase of phrases) {
  const coreResult = calchemy.parseDate(phrase, context);
  lastJevResponse = null;
  let jevResult;
  try {
    jevResult = await jev.parseDate(phrase, context);
  } catch (error) {
    jevResult = { status: "error", message: error instanceof Error ? error.message : String(error) };
  }
  rows.push({
    phrase,
    core: describe(coreResult),
    jev: jevResult.status === "error" ? `error: ${jevResult.message}` : describe(jevResult),
    jevAnswers: lastJevResponse ? summarizeAnswers(lastJevResponse) : "",
    verdict: verdictFor(coreResult, jevResult),
  });
}

printReport(rows, referenceDate);

// Example: `verdictFor(valid, valid)` returns "disagree" when the two dates differ.
function verdictFor(coreResult, jevResult) {
  if (jevResult.status === "error") return "jev error";
  if (coreResult.status === "valid" && jevResult.status === "valid") {
    return sameValue(coreResult.value, jevResult.value) ? "agree" : "disagree";
  }
  if (coreResult.status === "ambiguous" && jevResult.status === "valid") return "date-core ambiguous";
  if (coreResult.status !== "invalid" && jevResult.status === "invalid") return "only date-core";
  if (coreResult.status === "invalid" && jevResult.status === "valid") return "only date-jev";
  return "neither";
}

function sameValue(a, b) {
  return JSON.stringify(toJSON(a)) === JSON.stringify(toJSON(b));
}

// Example: `describe(result)` returns "2026-06-05", "2026-06-01..2026-06-07", or "invalid".
function describe(result) {
  if (result.status === "ambiguous") return `ambiguous (${result.candidates.length} readings)`;
  if (result.status !== "valid") return "invalid";
  const value = toJSON(result.value);
  if (value.kind === "single") return value.date;
  if (value.kind === "range") return `${value.start}..${value.end}`;
  return value.dates.length <= 3 ? value.dates.join(", ") : `${value.dates.length} dates from ${value.dates[0]}`;
}

function summarizeAnswers(response) {
  return Object.entries(response.answers)
    .map(([name, answer]) => `${name}=${answer.choice} ${answer.confidence.toFixed(2)}`)
    .join("  ");
}

function printReport(rows, referenceDate) {
  const counts = VerdictOrder.map((verdict) => [verdict, rows.filter((row) => row.verdict === verdict).length])
    .filter(([, count]) => count > 0)
    .map(([verdict, count]) => `${count} ${verdict}`);
  console.log(`${rows.length} phrases, reference date ${referenceDate}: ${counts.join(", ")}`);

  const width = Math.max(...rows.map((row) => row.phrase.length), 6);
  for (const verdict of VerdictOrder) {
    const group = rows.filter((row) => row.verdict === verdict);
    if (group.length === 0) continue;
    console.log(`\n## ${verdict}`);
    for (const row of group) {
      console.log(`${row.phrase.padEnd(width)}  core ${row.core.padEnd(24)} jev ${row.jev.padEnd(24)} ${row.jevAnswers}`);
    }
  }
}

// Answers a request from the cache when this exact request was asked before; otherwise asks Jev.
async function cachedFetch(url, init) {
  const body = String(init.body);
  const file = new URL(`${createHash("sha256").update(body).digest("hex").slice(0, 24)}.json`, cacheDir);
  if (!fresh && existsSync(file)) {
    const cached = readFileSync(file, "utf8");
    lastJevResponse = JSON.parse(cached);
    return new Response(cached, { status: 200, headers: { "content-type": "application/json" } });
  }

  const response = await fetch(url, init);
  if (response.ok) {
    const text = await response.clone().text();
    lastJevResponse = JSON.parse(text);
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(file, text);
  }
  return response;
}

function parseArgs(args) {
  let referenceDate = DefaultReferenceDate;
  let fresh = false;
  const phrases = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--fresh") fresh = true;
    else if (arg === "--reference-date") referenceDate = args[++index];
    else phrases.push(arg);
  }

  return { phrases: phrases.length > 0 ? phrases : phrasesFromFile(), referenceDate, fresh };
}

function phrasesFromFile() {
  return readFileSync(new URL("./compare-phrases.txt", import.meta.url), "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}
