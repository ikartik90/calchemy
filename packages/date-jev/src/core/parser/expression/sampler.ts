import type { DateExpression } from "./types";
import type { SamplerSlice } from "../slice/sampler";

export function findSamplerInExpression(expression: DateExpression): SamplerSlice | null {
  if (expression.kind === "sample") {
    return expression.sampler;
  }

  if (expression.kind === "select" || expression.kind === "iterate") {
    return findSamplerInExpression(expression.inner);
  }

  return null;
}
