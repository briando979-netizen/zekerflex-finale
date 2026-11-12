import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { retentionCutoff } from "@/lib/privacy/retention";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { deleteUpload } from "@/lib/storage/local";
import { isOpgeschoond, kycOpschonen, kycUploadIds } from "@/lib/privacy/kyc-fotos";
import { ruimChatlogOp } from "@/lib/learn/store";
import { ruimWeesrekeningenOp } from "@/lib/privacy/bank-wissen";

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

/**
 * De upload-id's die nergens anders meer in gebruik zijn: niet als document (ID, bank), werkrecht of certificaat, en
 * niet als foto van een andere ID-controle dan de controles die nu worden opgeschoond.
 */
async function nietEldersGebruikt(ids: string[], behalveControles: Set<string>): Promise<string[]> {
  const [docs, werkrecht, certs, controles] = await Promise.all([
    prisma.complianceDocument.findMany({ where: { uploadId: { in: ids } }, select: { uploadId: true } }),
    prisma.workRight.findMany({ where: { uploadId: { in: ids } }, select: { uploadId: true } }),
    prisma.certificate.findMany({ where: { uploadId: { in: ids } }, select: { uploadId: true } }),
    prisma.identityVerification.findMany({ where: { rawPayload: { not: {} } }, select: { id: true, rawPayload: true } }),
  ]);
  const inGebruik = new Set<string>();
  for (const r of [...docs, ...werkrecht, ...certs]) if (r.uploadId) inGebruik.add(r.uploadId);
  for (const c of controles) if (!behalveControles.has(c.id)) for (const id of kycUploadIds(c.rawPayload)) inGebruik.add(id);
  return ids.filter((id) => !inGebruik.has(id));
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

  // Berichten tussen leerling en rijschool: na 2 jaar weg.
  const berichtCut = retentionCutoff("rijschool_berichten", now)!;
  cleared.rijschool_berichten = dryRun
    ? await prisma.rijschoolBericht.count({ where: { createdAt: { lt: berichtCut } } })
    : (await prisma.rijschoolBericht.deleteMany({ where: { createdAt: { lt: berichtCut } } })).count;

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

  // Tafelreserveringen via een klantsite (lib/sites/reserveringen-opslag.ts): na dezelfde 12 maanden helemaal weg.
  // De dag zit in de sleutel: site-reservering:<siteId>:<datum>:<id>.
  const siteDag = amsterdamDayKey(horecaCut);
  const siteOud = (await prisma.keyValueStore.findMany({ where: { key: { startsWith: "site-reservering:" } }, select: { key: true } }))
    .map((r) => r.key)
    .filter((k) => (k.split(":")[2] ?? "9999") < siteDag);
  cleared.site_reserveringen = dryRun || siteOud.length === 0 ? siteOud.length : (await prisma.keyValueStore.deleteMany({ where: { key: { in: siteOud } } })).count;

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

  // De leerlijsten van de assistenten (lib/learn/store.ts): vragen en beoordelingen na 90 dagen weg. Een storing in de opslag
  // laat de rest van de sweep gewoon doorlopen.
  cleared.chatlog = await ruimChatlogOp(now, dryRun).catch((err) => {
    logger.warn("retention sweep: chatlog opruimen mislukt", { error: (err as Error).message });
    return 0;
  });

  cleared.password_reset_tokens = dryRun
    ? await prisma.passwordResetToken.count({ where: { expiresAt: { lt: now } } })
    : (
        await prisma.passwordResetToken.deleteMany({
          where: { expiresAt: { lt: now } },
        })
      ).count;

  // KYC: keep the decision, drop the sensitive payload after the window. De selfies (biometrie) gaan mét het bestand
  // weg; voor- en achterkant blijven gekoppeld (kopie van het identiteitsbewijs, en het wissen van het account vindt
  // ze zo terug). Vroeger werd rawPayload leeg en bleven alle foto's los en onvindbaar staan (lib/privacy/kyc-fotos.ts).
  const kycCut = retentionCutoff("kyc", now)!;
  const kycRijen = (
    await prisma.identityVerification.findMany({
      where: {
        updatedAt: { lt: kycCut },
        OR: [
          { rawPayload: { not: {} } },
          { livenessScore: { not: null } },
          { faceMatchScore: { not: null } },
          { documentNumberHash: { not: null } },
        ],
      },
      select: { id: true, rawPayload: true, livenessScore: true, faceMatchScore: true, documentNumberHash: true },
    })
  ).filter((r) => !isOpgeschoond(r.rawPayload) || r.livenessScore !== null || r.faceMatchScore !== null || r.documentNumberHash !== null);
  const opschonen = kycRijen.map((r) => ({ id: r.id, ...kycOpschonen(r.rawPayload) }));
  const selfies = [...new Set(opschonen.flatMap((o) => o.selfies))];
  const selfiesWeg = selfies.length === 0 ? [] : await nietEldersGebruikt(selfies, new Set(opschonen.map((o) => o.id)));
  cleared.kyc = kycRijen.length;
  cleared.kyc_selfies = selfiesWeg.length;
  if (!dryRun) {
    for (const o of opschonen) {
      await prisma.identityVerification.update({
        where: { id: o.id },
        data: { rawPayload: o.nieuwePayload, livenessScore: null, faceMatchScore: null, documentNumberHash: null, documentType: null },
      });
    }
    // pas na het loskoppelen de bestanden; een mislukte wis komt in het logboek (alleen het aantal, geen id's)
    let mislukt = 0;
    for (const id of selfiesWeg) await deleteUpload(id).catch(() => (mislukt += 1));
    if (mislukt > 0) logger.warn("retention sweep: kyc-selfies niet gewist", { mislukt });
  }

  // Bankrekeningen van een gewist of verdwenen account met nog een naam of IBAN erin (lib/privacy/bank-wissen.ts,
  // gemeten 12 nov: 8 stuks). Een storing laat de rest van de sweep doorlopen.
  cleared.bank_wezen = await ruimWeesrekeningenOp({ dryRun, nu: now }).catch((err) => {
    logger.warn("retention sweep: bankrekeningen niet opgeruimd", { soort: err instanceof Error ? err.name : "onbekend" });
    return 0;
  });

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
