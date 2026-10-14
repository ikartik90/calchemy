import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { TypeSafeClient } from "@typesafe-ai/sdk";

type Request = { state: unknown; questions: unknown };

/** Each call date-jev made for a phrase, in order: one, or two when a split phrase is not a range. */
type Recording = {
  calls: Array<{ request: Request; response: unknown }>;
};

// Example: `replayClient("next friday")` answers date-jev's calls with those in
// `tests/recordings/next-friday.json`, in order.
export function replayClient(phrase: string): TypeSafeClient {
  const { calls } = readRecording(phrase);
  let next = 0;

  return new TypeSafeClient({
    apiKey: "replay",
    retry: { maxRetries: 0 },
    fetch: async (_url, init) => {
      const call = calls[next];
      next += 1;
      if (!call) {
        throw new Error(`date-jev made more calls for "${phrase}" than were recorded. Re-record it: pnpm record-jev "${phrase}"`);
      }

      assertSameRequest(phrase, call.request, JSON.parse(String(init?.body)));
      return new Response(JSON.stringify(call.response), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
}

// Example: `unusedClient()` fails any request, for inputs date-jev should answer without asking Jev.
export function unusedClient(): TypeSafeClient {
  return new TypeSafeClient({
    apiKey: "replay",
    retry: { maxRetries: 0 },
    fetch: async () => {
      throw new Error("date-jev asked Jev for an input it should answer on its own");
    },
  });
}

// A live recording only answers the questions it was recorded with. When date-jev asks something
// else, replaying it would test stale answers, so fail and say how to re-record.
function assertSameRequest(phrase: string, recorded: Request, sent: Request) {
  if (!isDeepStrictEqual(sent.state, recorded.state) || !isDeepStrictEqual(sent.questions, recorded.questions)) {
    throw new Error(`date-jev's questions changed since "${phrase}" was recorded. Re-record it: pnpm record-jev "${phrase}"`);
  }
}

function readRecording(phrase: string): Recording {
  // Escaped as scripts/record-jev.mjs does, so a `?` in the phrase stays part of the file name.
  const file = new URL(`../recordings/${encodeURIComponent(phrase.replaceAll(" ", "-"))}.json`, import.meta.url);
  return JSON.parse(readFileSync(file, "utf8")) as Recording;
}
