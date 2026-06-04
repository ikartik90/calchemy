import type { DurationUnit, Token } from "../../types";
import type { StructuralShorthand } from "../primitives/shorthands";
import type {
  Connector,
  ExclusionMarker,
  Period,
  SamplerChunkCommand,
} from "../types";

export type StandardChunk =
  | { kind: "command"; value: SamplerChunkCommand; token: Token }
  | { kind: "connector"; value: Connector; token: Token }
  | { kind: "duration-unit"; value: DurationUnit; token: Token }
  | { kind: "exclusion-marker"; value: ExclusionMarker; token: Token }
  | { kind: "month"; value: number; token: Token }
  | { kind: "number"; value: number; token: Token }
  | { kind: "ordinal"; value: number; token: Token }
  | { kind: "period"; value: Period; token: Token }
  | { kind: "relative"; value: string; token: Token }
  | { kind: "separator"; value: string; token: Token }
  | { kind: "shorthand"; value: StructuralShorthand; token: Token }
  | { kind: "weekday"; value: number; token: Token }
  | { kind: "word"; value: string; token: Token };
