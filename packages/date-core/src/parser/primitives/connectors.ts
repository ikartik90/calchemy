import { ConnectorAliasEntries, ConnectorValues, type Connector } from "../types";

const Connectors = new Set<string>(ConnectorValues);
const ConnectorAliases: ReadonlyMap<string, Connector> = new Map(ConnectorAliasEntries);

// Example: `parseConnector("until")` returns `until`.
export function parseConnector(input: string): Connector | null {
  return ConnectorAliases.get(input) ?? (Connectors.has(input) ? (input as Connector) : null);
}
