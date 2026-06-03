export type Connector =
  | "after"
  | "and"
  | "before"
  | "between"
  | "during"
  | "following"
  | "for"
  | "from"
  | "in"
  | "minus"
  | "of"
  | "or"
  | "plus"
  | "preceding"
  | "through"
  | "to"
  | "until"
  | ",";

const CONNECTORS = new Set<Connector>([
  "after",
  "and",
  "before",
  "between",
  "during",
  "following",
  "for",
  "from",
  "in",
  "minus",
  "of",
  "or",
  "plus",
  "preceding",
  "through",
  "to",
  "until",
  ",",
]);

export function parseConnector(input: string): Connector | null {
  return CONNECTORS.has(input as Connector) ? (input as Connector) : null;
}
