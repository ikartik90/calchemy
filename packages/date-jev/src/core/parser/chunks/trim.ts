import type { StandardChunk } from "./types";

// Example: `trimLeadingSeparators(chunksFor(", august 10"))` removes leading separators.
export function trimLeadingSeparators(chunks: readonly StandardChunk[]): readonly StandardChunk[] {
  let start = 0;
  while (chunks[start]?.kind === "separator") {
    start += 1;
  }
  return chunks.slice(start);
}

// Example: `trimTrailingSeparators(chunksFor("august 10,"))` removes trailing separators.
export function trimTrailingSeparators(chunks: readonly StandardChunk[]): readonly StandardChunk[] {
  let end = chunks.length;
  while (chunks[end - 1]?.kind === "separator") {
    end -= 1;
  }
  return chunks.slice(0, end);
}
