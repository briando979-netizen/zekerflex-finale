import { logger } from "@/lib/logger";
import { runSalesAgent } from "./sales-agent";
import { runRecruiterAgent } from "./recruiter-agent";
import { runComplianceAgent } from "./compliance-agent";
import { runFinanceAgent } from "./finance-agent";
import type { AgentId, AgentReport } from "./types";

const AGENTS: Record<AgentId, () => Promise<AgentReport>> = {
  sales: runSalesAgent,
  recruiter: runRecruiterAgent,
  compliance: runComplianceAgent,
  finance: runFinanceAgent,
  quality: async () => ({ agentId: "quality", runAt: new Date().toISOString(), durationMs: 0, actionsProposed: [], summary: "Quality agent: nog niet geimplementeerd.", errors: [] }),
  klantenservice: async () => ({ agentId: "klantenservice", runAt: new Date().toISOString(), durationMs: 0, actionsProposed: [], summary: "Klantenservice agent: nog niet geimplementeerd.", errors: [] }),
};

export async function runAgents(agentIds: AgentId[] = ["sales", "recruiter", "compliance", "finance"]): Promise<AgentReport[]> {
  logger.info("orchestrator: start multi-agent run", { agentIds });
  const results = await Promise.allSettled(agentIds.map((id) => AGENTS[id]?.() ?? Promise.resolve({ agentId: id as AgentId, runAt: new Date().toISOString(), durationMs: 0, actionsProposed: [], summary: "Onbekende agent.", errors: [] } as AgentReport)));
  return results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    const id = agentIds[i] ?? "unknown";
    logger.error("orchestrator: agent gecrasht", { agentId: id });
    return { agentId: id as AgentId, runAt: new Date().toISOString(), durationMs: 0, actionsProposed: [], summary: "Agent gecrasht.", errors: [String(r.reason)] };
  });
}

export type { AgentReport, AgentAction } from "./types";
