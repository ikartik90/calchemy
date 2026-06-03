const CONNECTOR_VALUES = [
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
] as const;

export type Connector = (typeof CONNECTOR_VALUES)[number];

const CONNECTORS = new Set<string>(CONNECTOR_VALUES);

export function parseConnector(input: string): Connector | null {
  return CONNECTORS.has(input) ? (input as Connector) : null;
}
