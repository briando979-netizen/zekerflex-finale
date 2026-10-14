import { prisma } from "@/lib/prisma";
import { chatJson } from "@/lib/ai/client";
import { logger } from "@/lib/logger";
import type { AgentReport, AgentAction } from "./types";

// ---------------------------------------------------------------------------
// Sales Agent — identifies new employer leads and proposes outreach actions.
// All actions require human approval — nothing is sent autonomously.
// ---------------------------------------------------------------------------

const SYSTEM_MSG = `Je bent een sales-agent voor ZekerFlex, een flexwerk-platform voor Nederland.
Je krijgt een lijst van potentiële leads/slapende accounts. Genereer voor elk een beknopt, persoonlijk
openingsbericht (max 3 zinnen, geen em-dashes, zakelijk maar menselijk). Antwoord als JSON array:
[{"targetId": string, "channel": "email"|"whatsapp", "message": string, "priorityScore": number}]`;

export async function runSalesAgent(): Promise<AgentReport> {
  const start = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];

  try {
    // Branches with no shifts ever
    const noShiftBranches = await prisma.branch.findMany({
      where: { shifts: { none: {} } },
      select: { id: true, name: true, city: true },
      take: 20,
    });

    // Branches gone quiet (no shift in last 30 days, but had some before)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000);
    const quietBranches = await prisma.branch.findMany({
      where: {
        shifts: { some: {}, none: { startsAt: { gte: thirtyDaysAgo } } },
      },
      select: { id: true, name: true, city: true },
      take: 20,
    });

    const targets = [
      ...noShiftBranches.map((b) => ({ id: b.id, name: b.name, city: b.city ?? "", reason: "Nog geen klus geplaatst" })),
      ...quietBranches.map((b) => ({ id: b.id, name: b.name, city: b.city ?? "", reason: "Inactief >30 dagen" })),
    ].slice(0, 15);

    if (targets.length === 0) {
      return { agentId: "sales", runAt: new Date().toISOString(), durationMs: Date.now() - start, actionsProposed: [], summary: "Geen sales-targets.", errors: [] };
    }

    const raw = await chatJson<Array<{ targetId: string; channel: string; message: string; priorityScore: number }>>({
      messages: [
        { role: "system", content: SYSTEM_MSG },
        { role: "user", content: JSON.stringify(targets, null, 2) },
      ],
      maxTokens: 600,
      purpose: "sales-agent",
    });

    for (const item of raw) {
      actions.push({
        kind: "CREATE_OUTREACH",
        payload: { branchId: item.targetId, channel: item.channel, message: item.message, priorityScore: item.priorityScore },
        requiresHumanApproval: true,
        rationale: `Outreach voor branch ${item.targetId} (prioriteit ${item.priorityScore})`,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(msg);
    logger.error("sales-agent: fout", { err: msg });
  }

  return {
    agentId: "sales",
    runAt: new Date().toISOString(),
    durationMs: Date.now() - start,
    actionsProposed: actions,
    summary: `${actions.length} outreach-acties voorgesteld.`,
    errors,
  };
}
