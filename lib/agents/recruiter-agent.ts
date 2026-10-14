import { prisma } from "@/lib/prisma";
import { chatJson } from "@/lib/ai/client";
import { logger } from "@/lib/logger";
import type { AgentReport, AgentAction } from "./types";

// ---------------------------------------------------------------------------
// Recruiter Agent — re-engages freelancers who are drifting away.
// ---------------------------------------------------------------------------

const SYSTEM_MSG = `Je bent een recruiter voor ZekerFlex. Je benadert flexwerkers die minder actief zijn.
Schrijf een kort, persoonlijk bericht (max 2 zinnen). Vriendelijk, direct, geen opsmuk. Geen em-dashes.
Antwoord als JSON array:
[{"freelancerId": string, "message": string, "angle": "nooit_geklust"|"stil_geworden"|"talent_risico"}]`;

export async function runRecruiterAgent(): Promise<AgentReport> {
  const start = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];

  try {
    const twentyOneDaysAgo = new Date(Date.now() - 21 * 86400_000);
    const sixtyDaysAgo = new Date(Date.now() - 60 * 86400_000);

    const neverWorked = await prisma.freelancerProfile.findMany({
      where: { assignments: { none: {} } },
      select: { id: true, skills: { select: { skill: { select: { name: true } } } } },
      take: 30,
    });

    const wentQuiet = await prisma.freelancerProfile.findMany({
      where: { assignments: { some: {}, none: { acceptedAt: { gte: twentyOneDaysAgo } } } },
      select: {
        id: true,
        assignments: { orderBy: { acceptedAt: "desc" }, take: 1, select: { acceptedAt: true } },
      },
      take: 20,
    });

    const talentAtRisk = await prisma.freelancerProfile.findMany({
      where: {
        reliabilityScore: { gte: 0.85 },
        assignments: { some: {}, none: { acceptedAt: { gte: sixtyDaysAgo } } },
      },
      select: { id: true, reliabilityScore: true },
      take: 15,
    });

    const targets = [
      ...neverWorked.map((f) => ({ id: f.id, angle: "nooit_geklust" as const, skills: f.skills.map((s) => s.skill.name).join(", ") })),
      ...wentQuiet.map((f) => ({ id: f.id, angle: "stil_geworden" as const, lastActive: f.assignments[0]?.acceptedAt?.toISOString() ?? null })),
      ...talentAtRisk.map((f) => ({ id: f.id, angle: "talent_risico" as const, reliabilityScore: f.reliabilityScore })),
    ].slice(0, 20);

    if (targets.length === 0) {
      return { agentId: "recruiter", runAt: new Date().toISOString(), durationMs: Date.now() - start, actionsProposed: [], summary: "Geen re-engagement targets.", errors: [] };
    }

    const raw = await chatJson<Array<{ freelancerId: string; message: string; angle: string }>>({
      messages: [
        { role: "system", content: SYSTEM_MSG },
        { role: "user", content: JSON.stringify(targets, null, 2) },
      ],
      maxTokens: 500,
      purpose: "recruiter-agent",
    });

    for (const item of raw) {
      actions.push({
        kind: "QUEUE_NOTIFICATION",
        payload: { freelancerId: item.freelancerId, channel: "push", message: item.message, angle: item.angle },
        requiresHumanApproval: true,
        rationale: `Re-engagement voor freelancer ${item.freelancerId} (${item.angle})`,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(msg);
    logger.error("recruiter-agent: fout", { err: msg });
  }

  return {
    agentId: "recruiter",
    runAt: new Date().toISOString(),
    durationMs: Date.now() - start,
    actionsProposed: actions,
    summary: `${actions.length} re-engagement berichten voorgesteld.`,
    errors,
  };
}
