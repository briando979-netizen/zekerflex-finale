import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { buildSepaCreditTransferBatch, type SepaBatchLine } from "@/lib/billing/sepa-batch";
import type { PayrollRun } from "@/lib/payroll/store";

export interface SepaBatchSkip {
  userId: string;
  workerName: string;
  reason: string;
}

export interface SepaExportResult {
  generated: boolean;
  totalCents: number;
  lineCount: number;
  skipped: SepaBatchSkip[];
  /** Why no batch was persisted at all (config missing, nothing payable). Never set when `generated`. */
  blockedReason?: string;
}

/**
 * Builds and persists the pain.001 SEPA batch for every payroll-track worker
 * in a finalised run. Best-effort by design: one worker's missing/invalid
 * IBAN is reported in `skipped` rather than blocking everyone else's wages,
 * and a platform-wide config problem (no SEPA_CREDITOR_IBAN set) is reported
 * back rather than thrown, so finaliseRun() can still mark the run definitive
 * even when the bank file can't be produced yet (e.g. a demo environment).
 */
export async function generateSepaBatch(run: PayrollRun, generatedBy: string): Promise<SepaExportResult> {
  const payrollSlips = run.payslips.filter(
    (p) => p.computed.breakdown.kind === "payroll" && p.toPayCents > 0,
  );
  if (payrollSlips.length === 0) {
    return { generated: false, totalCents: 0, lineCount: 0, skipped: [], blockedReason: "Geen payroll-werkers met een uit te betalen bedrag deze week." };
  }

  if (!env.SEPA_CREDITOR_IBAN) {
    logger.warn("payroll: SEPA batch skipped, SEPA_CREDITOR_IBAN not configured", { isoWeek: run.isoWeek });
    return {
      generated: false,
      totalCents: 0,
      lineCount: 0,
      skipped: [],
      blockedReason: "SEPA_CREDITOR_IBAN is niet ingesteld — geen betaalbestand gegenereerd.",
    };
  }

  const profiles = await prisma.freelancerProfile.findMany({
    where: { id: { in: payrollSlips.map((p) => p.freelancerId) } },
    select: { id: true, payoutIban: true },
  });
  const ibanByFreelancerId = new Map(profiles.map((p) => [p.id, p.payoutIban]));

  const skipped: SepaBatchSkip[] = [];
  const lines: SepaBatchLine[] = [];
  const slipByEndToEndId = new Map<string, (typeof payrollSlips)[number]>();
  payrollSlips.forEach((p, i) => {
    const endToEndId = `ZF-${run.isoWeek}-${String(i + 1).padStart(4, "0")}`;
    slipByEndToEndId.set(endToEndId, p);
    const iban = ibanByFreelancerId.get(p.freelancerId);
    if (!iban) {
      skipped.push({ userId: p.userId, workerName: p.workerName, reason: "Geen rekeningnummer op het profiel" });
      return;
    }
    lines.push({
      endToEndId,
      creditorName: p.workerName,
      creditorIban: iban,
      amountCents: p.toPayCents,
      remittanceInfo: `ZekerFlex loon ${run.weekLabel}`,
    });
  });

  let built: ReturnType<typeof buildSepaCreditTransferBatch>;
  try {
    built = buildSepaCreditTransferBatch({
      messageId: `ZF-PAYROLL-${run.isoWeek}`,
      debtorName: env.SEPA_CREDITOR_NAME,
      debtorIban: env.SEPA_CREDITOR_IBAN,
      requestedExecutionDate: new Date().toISOString().slice(0, 10),
      lines,
    });
  } catch (err) {
    logger.error("payroll: SEPA batch build failed", { isoWeek: run.isoWeek, error: (err as Error).message });
    return {
      generated: false,
      totalCents: 0,
      lineCount: 0,
      skipped,
      blockedReason: (err as Error).message,
    };
  }

  for (const r of built.results) {
    if (!r.ok) {
      const slip = slipByEndToEndId.get(r.line.endToEndId);
      skipped.push({ userId: slip?.userId ?? "", workerName: r.line.creditorName, reason: r.reason ?? "Ongeldig" });
    }
  }

  if (!built.xml) {
    return {
      generated: false,
      totalCents: 0,
      lineCount: 0,
      skipped,
      blockedReason: "Geen enkele werker had een geldig rekeningnummer — geen betaalbestand gegenereerd.",
    };
  }

  const okResults = built.results.filter((r) => r.ok);
  const totalCents = okResults.reduce((s, r) => s + r.line.amountCents, 0);
  const lineCount = okResults.length;

  await prisma.payrollSepaBatch.upsert({
    where: { isoWeek: run.isoWeek },
    create: {
      isoWeek: run.isoWeek,
      xml: built.xml,
      debtorIban: env.SEPA_CREDITOR_IBAN,
      lineCount,
      skippedJson: skipped as unknown as Prisma.InputJsonValue,
      totalCents,
      generatedBy,
    },
    update: {
      xml: built.xml,
      debtorIban: env.SEPA_CREDITOR_IBAN,
      lineCount,
      skippedJson: skipped as unknown as Prisma.InputJsonValue,
      totalCents,
      generatedBy,
    },
  });

  logger.info("payroll: SEPA batch generated", { isoWeek: run.isoWeek, lineCount, totalCents, skipped: skipped.length });
  return { generated: true, totalCents, lineCount, skipped };
}
