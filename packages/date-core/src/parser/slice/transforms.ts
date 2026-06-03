import type { DurationUnit } from "../../types";

export type TransformSlice = {
  amount: number;
  direction: "add" | "subtract";
  unit: DurationUnit;
};
