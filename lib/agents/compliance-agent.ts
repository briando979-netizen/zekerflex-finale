import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type { AgentReport, AgentAction } from "./types";

// ---------------------------------------------------------------------------
// Compliance Agent — DBA-exclusivity risk + expired cert on active matches.
// ---------------------------------------------------------------------------

const DBA_EXCLUSIVE_THRESHOLD_DAYS = 180;

export async function runComplianceAgent(): Promise<AgentReport> {
  const start = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];

  try {
    const cutoff = new Date(Date.now() - DBA_EXCLUSIVE_THRESHOLD_DAYS * 86400_000);

    // 1. DBA-exclusivity: freelancer working >80% at one employer (via branch.tenantId)
    const assignments = await prisma.shiftAssignment.findMany({
      where: { acceptedAt: { gte: cutoff } },
      select: { freelancerId: true, shift: { select: { branch: { select: { tenantId: true } } } } },
      take: 5000,
    });

    type TenantCount = Record<string, number>;
    const byFreelancer: Record<string, TenantCount> = {};
    for (const a of assignments) {
      const fId = a.freelancerId;
      const tId = a.shift.branch.tenantId;
      if (!byFreelancer[fId]) byFreelancer[fId] = {};
      byFreelancer[fId][tId] = (byFreelancer[fId][tId] ?? 0) + 1;
    }

    for (const [freelancerId, tenantCounts] of Object.entries(byFreelancer)) {
      const total = Object.values(tenantCounts).reduce((a, b) => a + b, 0);
      for (const [tenantId, count] of Object.entries(tenantCounts)) {
        if (total > 4 && count / total > 0.8) {
          actions.push({
            kind: "FLAG_COMPLIANCE",
            payload: { type: "DBA_EXCLUSIVITY_RISK", freelancerId, tenantId, exclusivityPct: Math.round((count / total) * 100), periodDays: DBA_EXCLUSIVE_THRESHOLD_DAYS },
            requiresHumanApproval: false,
            rationale: `Freelancer ${freelancerId} werkt ${Math.round((count / total) * 100)}% exclusief bij één werkgever — DBA-risico.`,
          });
        }
      }
    }

    // 2. Active matches with expired/missing cert — Shift has requiredSkillId, not certifications.
    // We flag matches where the freelancer has no verified cert for the required skill type.
    const activeMatches = await prisma.shiftMatch.findMany({
      where: { status: { in: ["ACCEPTED", "NOTIFIED"] } },
      select: { freelancerId: true, shiftId: true },
      take: 500,
    });

    for (const m of activeMatches) {
      // Check if freelancer's certs are up to date — we look for any expired cert
      const freelancer = await prisma.freelancerProfile.findUnique({
        where: { id: m.freelancerId },
        select: { userId: true },
      });
      if (!freelancer) continue;

      const expiredCerts = await prisma.certificate.findMany({
        where: { userId: freelancer.userId, status: "VALID", expiresOn: { lt: new Date() } },
        select: { type: true },
      });

      if (expiredCerts.length > 0) {
        actions.push({
          kind: "FLAG_COMPLIANCE",
          payload: { type: "EXPIRED_CERT_ON_ACTIVE_MATCH", shiftId: m.shiftId, freelancerId: m.freelancerId, expiredCerts: expiredCerts.map((c) => c.type) },
          requiresHumanApproval: true,
          rationale: `Freelancer ${m.freelancerId} heeft verlopen certificaten actief op klus ${m.shiftId}.`,
        });
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(msg);
    logger.error("compliance-agent: fout", { err: msg });
  }

  return {
    agentId: "compliance",
    runAt: new Date().toISOString(),
    durationMs: Date.now() - start,
    actionsProposed: actions,
    summary: `${actions.length} compliance-bevindingen.`,
    errors,
  };
}
