import { ConnectorValues, type Connector } from "../types";

const Connectors = new Set<string>(ConnectorValues);

// Example: `parseConnector("until")` returns `until`.
export function parseConnector(input: string): Connector | null {
  return Connectors.has(input) ? (input as Connector) : null;
}
