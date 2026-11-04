import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { retentionCutoff } from "@/lib/privacy/retention";
import { amsterdamDayKey } from "@/lib/time/amsterdam";

// ---------------------------------------------------------------------------
// Retention sweep.
//
// Applies the `delete`-on-expiry rules of the retention schedule: rows whose
// anchor event is older than the rule's period are removed (or, for KYC,
// minimised to just the pass/fail decision). Idempotent — safe to run on any
// schedule. `dryRun` counts what WOULD go without touching anything.
//
// The `anonymise`-on-expiry rules (invoices, timesheets, model agreements,
// payroll, the audit log) have a 7-year horizon; nothing qualifies yet, so
// they are reported as `pending` for now.
// ---------------------------------------------------------------------------

export interface SweepResult {
  ranAt: string;
  dryRun: boolean;
  cleared: Record<string, number>;
  pending: string[];
}

export async function runRetentionSweep(
  opts: { dryRun?: boolean; now?: Date } = {},
): Promise<SweepResult> {
  const dryRun = opts.dryRun ?? false;
  const now = opts.now ?? new Date();
  const cleared: Record<string, number> = {};

  const gpsCut = retentionCutoff("gps_events", now)!;
  cleared.gps_events = dryRun
    ? await prisma.gpsEvent.count({ where: { recordedAt: { lt: gpsCut } } })
    : (await prisma.gpsEvent.deleteMany({ where: { recordedAt: { lt: gpsCut } } })).count;

  // Lesroutes van rijscholen: na 2 jaar alleen de route weg, de les zelf blijft.
  const routeCut = retentionCutoff("rijschool_lesroutes", now)!;
  const routeWhere = { start: { lt: routeCut }, NOT: { route: { equals: Prisma.DbNull } } };
  cleared.rijschool_lesroutes = dryRun
    ? await prisma.rijschoolLes.count({ where: routeWhere })
    : (await prisma.rijschoolLes.updateMany({ where: routeWhere, data: { route: Prisma.DbNull } })).count;

  // Horeca: na 12 maanden naam, e-mail, telefoon en opmerking van gasten weg;
  // datum, tijd, aantal personen en bedragen blijven voor de cijfers van de zaak.
  const horecaCut = retentionCutoff("horeca_gasten", now)!;
  const resWhere = {
    datum: { lt: amsterdamDayKey(horecaCut) },
    OR: [{ naam: { not: "Gast" } }, { email: { not: "" } }, { telefoon: { not: "" } }, { opmerking: { not: "" } }],
  };
  const bestelWhere = { createdAt: { lt: horecaCut }, OR: [{ naam: { not: "" } }, { opmerking: { not: "" } }] };
  cleared.horeca_gasten = dryRun
    ? (await prisma.horecaReservering.count({ where: resWhere })) + (await prisma.horecaBestelling.count({ where: bestelWhere }))
    : (await prisma.horecaReservering.updateMany({ where: resWhere, data: { naam: "Gast", email: "", telefoon: "", opmerking: "" } })).count +
      (await prisma.horecaBestelling.updateMany({ where: bestelWhere, data: { naam: "", opmerking: "" } })).count;

  const deviceCut = retentionCutoff("device_fingerprint", now)!;
  cleared.device_fingerprint = dryRun
    ? await prisma.deviceFingerprint.count({ where: { lastSeenAt: { lt: deviceCut } } })
    : (
        await prisma.deviceFingerprint.deleteMany({
          where: { lastSeenAt: { lt: deviceCut } },
        })
      ).count;

  const engagementCut = retentionCutoff("engagement_events", now)!;
  cleared.engagement_events = dryRun
    ? await prisma.engagementEvent.count({ where: { occurredAt: { lt: engagementCut } } })
    : (
        await prisma.engagementEvent.deleteMany({
          where: { occurredAt: { lt: engagementCut } },
        })
      ).count;

  cleared.password_reset_tokens = dryRun
    ? await prisma.passwordResetToken.count({ where: { expiresAt: { lt: now } } })
    : (
        await prisma.passwordResetToken.deleteMany({
          where: { expiresAt: { lt: now } },
        })
      ).count;

  // KYC: keep the decision, drop the sensitive payload after the window.
  const kycCut = retentionCutoff("kyc", now)!;
  const kycWhere = {
    updatedAt: { lt: kycCut },
    OR: [
      { rawPayload: { not: {} } },
      { livenessScore: { not: null } },
      { faceMatchScore: { not: null } },
      { documentNumberHash: { not: null } },
    ],
  };
  cleared.kyc = dryRun
    ? await prisma.identityVerification.count({ where: kycWhere })
    : (
        await prisma.identityVerification.updateMany({
          where: kycWhere,
          data: {
            rawPayload: {},
            livenessScore: null,
            faceMatchScore: null,
            documentNumberHash: null,
            documentType: null,
          },
        })
      ).count;

  const result: SweepResult = {
    ranAt: now.toISOString(),
    dryRun,
    cleared,
    pending: [
      "timesheets",
      "invoices_payments",
      "model_agreements",
      "payroll",
      "audit_log",
    ],
  };

  const total = Object.values(cleared).reduce((a, b) => a + b, 0);
  if (!dryRun && total > 0) {
    logger.info("retention sweep", { cleared });
    await recordAudit({
      category: "SECURITY",
      action: "privacy.retention.swept",
      severity: "info",
      actorLabel: "system",
      summary: `Retentie-sweep: ${total} records opgeschoond`,
      metadata: { cleared },
    });
  }
  return result;
}
