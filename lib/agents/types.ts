// ---------------------------------------------------------------------------
// Shared types for the ZekerFlex multi-agent system.
// Each agent is a stateless async function that reads platform state and
// emits structured actions. No agent mutates state directly — all mutations
// require human confirmation via the admin console or an explicit approval
// step (same pattern as the Jarvis orchestration loop).
// ---------------------------------------------------------------------------

export type AgentId =
  | "sales"
  | "recruiter"
  | "compliance"
  | "finance"
  | "quality"
  | "klantenservice";

export type ActionKind =
  | "NONE"
  | "SEND_MESSAGE"
  | "CREATE_OUTREACH"
  | "FLAG_COMPLIANCE"
  | "RECONCILE_PAYMENT"
  | "ESCALATE_TICKET"
  | "QUEUE_NOTIFICATION";

export interface AgentAction {
  kind: ActionKind;
  payload: Record<string, unknown>;
  requiresHumanApproval: boolean;
  rationale: string;
}

export interface AgentReport {
  agentId: AgentId;
  runAt: string;
  durationMs: number;
  actionsProposed: AgentAction[];
  summary: string;
  errors: string[];
}
