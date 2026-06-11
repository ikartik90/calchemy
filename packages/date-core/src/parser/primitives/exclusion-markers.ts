import { ExclusionMarkerAliasEntries, ExclusionMarkerValues, type ExclusionMarker } from "../types";

const ExclusionMarkers = new Set<string>(ExclusionMarkerValues);
const ExclusionMarkerAliases: ReadonlyMap<string, ExclusionMarker> = new Map(ExclusionMarkerAliasEntries);

// Example: `parseExclusionMarker("excl")` returns `excluding`.
export function parseExclusionMarker(input: string): ExclusionMarker | null {
  return ExclusionMarkerAliases.get(input) ?? (ExclusionMarkers.has(input) ? (input as ExclusionMarker) : null);
}
