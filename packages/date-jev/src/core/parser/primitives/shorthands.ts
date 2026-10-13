export type StructuralShorthand =
  | { kind: "week"; ordinal: number }
  | { kind: "month"; ordinal: number }
  | { kind: "quarter"; ordinal: number };

// Example: `parseStructuralShorthand("w52")` returns week shorthand with ordinal `52`.
export function parseStructuralShorthand(input: string): StructuralShorthand | null {
  const match = /^([wmq])\s*(\d+)$/i.exec(input);
  if (!match?.[1] || !match[2]) {
    return null;
  }

  const ordinal = Number(match[2]);
  if (!Number.isInteger(ordinal) || ordinal < 1) {
    return null;
  }

  if (match[1].toLowerCase() === "w") {
    return { kind: "week", ordinal };
  }

  if (match[1].toLowerCase() === "m") {
    return { kind: "month", ordinal };
  }

  return { kind: "quarter", ordinal };
}
