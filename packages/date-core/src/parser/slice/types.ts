export type BoundarySlice =
  | { kind: "raw"; input: string }
  | { kind: "between"; startInput: string; endInput: string };

export type SamplerSlice =
  | { kind: "all-days"; interval: number; startIndex: number }
  | { kind: "day-number-parity"; parity: "odd" | "even" }
  | { kind: "weekdays"; weekdays: number[]; interval: number; startIndex: number };

export type ExclusionSlice = {
  input: string;
};

export type DateSlice = {
  boundary: BoundarySlice;
  exclusions: ExclusionSlice[];
  sampler: SamplerSlice | null;
};
