import type { BoundarySlice } from "./types";

export function rawBoundary(input: string): BoundarySlice {
  return { kind: "raw", input: input.trim() };
}

export function betweenBoundary(startInput: string, endInput: string): BoundarySlice {
  return { kind: "between", startInput: startInput.trim(), endInput: endInput.trim() };
}
