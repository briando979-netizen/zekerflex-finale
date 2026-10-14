import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type { AgentReport, AgentAction } from "./types";

// ---------------------------------------------------------------------------
// Finance Agent — surfaces financial anomalies and reconciliation gaps.
// ---------------------------------------------------------------------------

export async function runFinanceAgent(): Promise<AgentReport> {
  const start = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];

  try {
    const fourteenDaysAgo = new Date(Date.now() - 14 * 86400_000);
    const threeDaysAgo = new Date(Date.now() - 3 * 86400_000);

    // 1. Approved timesheets with no invoice
    const unbilledTimesheets = await prisma.timesheet.findMany({
      where: { status: "APPROVED", invoices: { none: {} } },
      select: { id: true, freelancerId: true },
      take: 50,
    }).catch(() => []);

    for (const ts of unbilledTimesheets) {
      actions.push({
        kind: "RECONCILE_PAYMENT",
        payload: { type: "MISSING_INVOICE", timesheetId: ts.id, freelancerId: ts.freelancerId },
        requiresHumanApproval: false,
        rationale: `Goedgekeurde timesheet ${ts.id} heeft geen factuur.`,
      });
    }

    // 2. Past-due invoices (ISSUED or DRAFT, past dueAt)
    const overdueInvoices = await prisma.invoice.findMany({
      where: { status: { in: ["ISSUED", "DRAFT"] }, dueAt: { lt: fourteenDaysAgo } },
      select: { id: true, recipientTenantId: true, totalCents: true, dueAt: true },
      take: 50,
    }).catch(() => []);

    for (const inv of overdueInvoices) {
      actions.push({
        kind: "FLAG_COMPLIANCE",
        payload: { type: "OVERDUE_INVOICE", invoiceId: inv.id, recipientTenantId: inv.recipientTenantId, totalEur: inv.totalCents / 100, dueAt: inv.dueAt?.toISOString() },
        requiresHumanApproval: true,
        rationale: `Factuur ${inv.id} (€${(inv.totalCents / 100).toFixed(2)}) is >14 dagen over vervaldatum.`,
      });
    }

    // 3. Advances not reconciled after payroll window
    const unreconciledAdvances = await prisma.advanceRecord.findMany({
      where: { status: "approved", reconciledAt: null, paidAt: { lt: threeDaysAgo } },
      select: { id: true, userId: true, netCents: true, isoWeek: true },
      take: 50,
    }).catch(() => []);

    for (const adv of unreconciledAdvances) {
      actions.push({
        kind: "RECONCILE_PAYMENT",
        payload: { type: "UNRECONCILED_ADVANCE", advanceId: adv.id, userId: adv.userId, netEur: adv.netCents / 100, isoWeek: adv.isoWeek },
        requiresHumanApproval: false,
        rationale: `Voorschot ${adv.id} (€${(adv.netCents / 100).toFixed(2)}) uitbetaald maar niet verrekend.`,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(msg);
    logger.error("finance-agent: fout", { err: msg });
  }

  const needApproval = actions.filter((a) => a.requiresHumanApproval).length;
  return {
    agentId: "finance",
    runAt: new Date().toISOString(),
    durationMs: Date.now() - start,
    actionsProposed: actions,
    summary: `${actions.length} financiële bevindingen. ${needApproval} vereisen goedkeuring.`,
    errors,
  };
}
