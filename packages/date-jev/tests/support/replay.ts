import { readFileSync } from "node:fs";
import { TypeSafeClient } from "@typesafe-ai/sdk";

type Recording = {
  response: unknown;
};

// Example: `replayClient("next friday")` answers every request with `tests/recordings/next-friday.json`.
export function replayClient(phrase: string): TypeSafeClient {
  const recording = readRecording(phrase);

  return new TypeSafeClient({
    apiKey: "replay",
    fetch: async () =>
      new Response(JSON.stringify(recording.response), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  });
}

function readRecording(phrase: string): Recording {
  const file = new URL(`../recordings/${phrase.replaceAll(" ", "-")}.json`, import.meta.url);
  return JSON.parse(readFileSync(file, "utf8")) as Recording;
}
