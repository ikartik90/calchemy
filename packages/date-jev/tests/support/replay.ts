import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { TypeSafeClient } from "@typesafe-ai/sdk";

type Recording = {
  request?: { state: unknown; questions: unknown };
  response: unknown;
};

// Example: `replayClient("next friday")` answers every request with `tests/recordings/next-friday.json`.
export function replayClient(phrase: string): TypeSafeClient {
  const recording = readRecording(phrase);

  return new TypeSafeClient({
    apiKey: "replay",
    retry: { maxRetries: 0 },
    fetch: async (_url, init) => {
      assertSameRequest(phrase, recording, JSON.parse(String(init?.body)));
      return new Response(JSON.stringify(recording.response), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
}

// A live recording only answers the questions it was recorded with. When date-jev asks something
// else, replaying it would test stale answers, so fail and say how to re-record.
function assertSameRequest(phrase: string, recording: Recording, sent: { state: unknown; questions: unknown }) {
  if (!recording.request) {
    return;
  }

  if (!isDeepStrictEqual(sent.state, recording.request.state) || !isDeepStrictEqual(sent.questions, recording.request.questions)) {
    throw new Error(`date-jev's questions changed since "${phrase}" was recorded. Re-record it: pnpm record-jev "${phrase}"`);
  }
}

function readRecording(phrase: string): Recording {
  const file = new URL(`../recordings/${phrase.replaceAll(" ", "-")}.json`, import.meta.url);
  return JSON.parse(readFileSync(file, "utf8")) as Recording;
}
