import type { z } from "zod";
import type { Principal } from "@/lib/auth";

// ---------------------------------------------------------------------------
// Natural-language admin console - shared contracts.
//
// The console never runs free-form SQL. A Dutch question is parsed (by the
// self-hosted LLM) into exactly one entry from a fixed registry of read-only
// QUERIES or data-changing MUTATIONS. Mutations are never executed on the
// first call: the console returns an impact analysis + a signed confirm token,
// and a separate audited endpoint runs the change.
// ---------------------------------------------------------------------------

export interface ConsoleContext {
  /** Absent when a handler runs from the orchestrator (system context). */
  principal?: Principal;
}

export interface QueryResult {
  /** Ordered column keys for tabular rendering. */
  columns: string[];
  rows: Array<Record<string, unknown>>;
  /** Single headline value for count-style answers. */
  scalar?: number | string;
  note?: string;
}

export interface QueryHandler {
  name: string;
  /** Shown to the LLM and to humans - describe when to pick this. */
  description: string;
  params: z.ZodTypeAny;
  /** Human-readable parameter hint for the catalogue prompt. */
  paramsHint: string;
  /** `params` is already validated by the caller against `params`. */
  run(params: unknown, ctx: ConsoleContext): Promise<QueryResult>;
}

export function defineQuery<S extends z.ZodTypeAny>(def: {
  name: string;
  description: string;
  params: S;
  paramsHint: string;
  run(params: z.infer<S>, ctx: ConsoleContext): Promise<QueryResult>;
}): QueryHandler {
  return {
    name: def.name,
    description: def.description,
    params: def.params,
    paramsHint: def.paramsHint,
    run: (params, ctx) => def.run(params as z.infer<S>, ctx),
  };
}

export interface MutationImpact {
  affectedCount: number;
  /** Up to ~10 example rows that would be changed. */
  sample: Array<Record<string, unknown>>;
  /** Advisory warnings surfaced before the operator confirms. */
  warnings: string[];
  reversible: boolean;
  summary: string;
}

export interface MutationResult {
  affectedCount: number;
  detail: string;
}

export type MutationRisk = "low" | "medium" | "high";

export interface MutationHandler {
  name: string;
  description: string;
  params: z.ZodTypeAny;
  paramsHint: string;
  risk: MutationRisk;
  /** Compute the blast radius WITHOUT changing anything. */
  dryRun(params: unknown, ctx: ConsoleContext): Promise<MutationImpact>;
  /** Apply the change. Only ever called from the confirm endpoint. */
  execute(params: unknown, ctx: ConsoleContext): Promise<MutationResult>;
}

export function defineMutation<S extends z.ZodTypeAny>(def: {
  name: string;
  description: string;
  params: S;
  paramsHint: string;
  risk: MutationRisk;
  dryRun(params: z.infer<S>, ctx: ConsoleContext): Promise<MutationImpact>;
  execute(params: z.infer<S>, ctx: ConsoleContext): Promise<MutationResult>;
}): MutationHandler {
  return {
    name: def.name,
    description: def.description,
    params: def.params,
    paramsHint: def.paramsHint,
    risk: def.risk,
    dryRun: (params, ctx) => def.dryRun(params as z.infer<S>, ctx),
    execute: (params, ctx) => def.execute(params as z.infer<S>, ctx),
  };
}

export type ParsedIntent =
  | { kind: "query"; name: string; params: Record<string, unknown> }
  | { kind: "mutation"; name: string; params: Record<string, unknown> }
  | { kind: "unknown"; reason: string };

export type ConsoleResponse =
  | {
      kind: "answer";
      query: string;
      params: Record<string, unknown>;
      result: QueryResult;
      summary: string | null;
    }
  | {
      kind: "advisory";
      action: string;
      params: Record<string, unknown>;
      risk: MutationHandler["risk"];
      impact: MutationImpact;
      confirmToken: string;
      confirmEndpoint: string;
      message: string;
    }
  | { kind: "clarification"; message: string };

export type ConfirmResponse = {
  kind: "executed";
  action: string;
  result: MutationResult;
};
