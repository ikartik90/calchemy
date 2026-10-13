/** The two ends of a phrase that may be a range, cut at a connector word. Jev decides whether it is one. */
export type RangeSplit = {
  start: string;
  end: string;
};

// Words or a dash that join the two ends of a range, as in `today until friday` or `aug 10-14`.
const RangeConnector = /\s+(?:until|till|through|thru|to)\s+|\s*[-–]\s*/i;

// Example: `splitRange("from today until friday")` returns `{ start: "today", end: "friday" }`, and
// `splitRange("aug 10-14")` returns `{ start: "aug 10", end: "14" }`.
export function splitRange(input: string): RangeSplit | null {
  const match = RangeConnector.exec(input);
  if (!match) {
    return null;
  }

  const start = input.slice(0, match.index).trim().replace(/^from\s+/i, "");
  const end = input.slice(match.index + match[0].length).trim();
  return start && end ? { start, end } : null;
}
