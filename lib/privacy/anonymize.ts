import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { recordUserErased } from "@/lib/metrics";
import { deleteUpload } from "@/lib/storage/local";
import { erasableNow, RETENTION_RULES } from "@/lib/privacy/retention";
import { erasableKvWhere } from "@/lib/privacy/user-kv";
import { wisPersoonUitLocatie } from "@/lib/locatie/avg";
import { annuleerOverdracht } from "@/lib/kyc/overdracht";

// ---------------------------------------------------------------------------
// Account erasure (AVG art. 17).
//
// `anonymizeUser` strips every direct and indirect identifier the platform
// holds for one person, across the models the retention schedule marks as
// erasable now. Data under a statutory retention duty (invoices, timesheets,
// model agreements, payroll, the audit log itself) is NOT removed — it is
// listed in the report as `retained` and cleared later by the retention sweep.
//
// Idempotent: a second call is a no-op. Never throws on a missing sub-record.
// ---------------------------------------------------------------------------

export const ERASED_EMAIL_DOMAIN = "verwijderd.zekerflex.invalid";
const REDACTION = "[verwijderd]";

export interface ErasureReport {
  userId: string;
  alreadyErased: boolean;
  erasedAt: string;
  /** Rows touched per retention category. */
  cleared: Record<string, number>;
  /** Categories kept because a statutory retention duty outweighs erasure. */
  retained: { key: string; label: string; basis: string; days: number }[];
}

function erasedEmail(userId: string): string {
  return `verwijderd-${userId}@${ERASED_EMAIL_DOMAIN}`;
}

/** Replace known identifiers in a free-text audit summary. */
export function scrubSummary(
  summary: string,
  identifiers: (string | null | undefined)[],
): string {
  let out = summary;
  for (const id of identifiers) {
    if (!id || id.length < 3) continue;
    out = out.split(id).join(REDACTION);
  }
  return out;
}

export async function isErased(userId: string): Promise<boolean> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  return Boolean(u && u.email.endsWith(`@${ERASED_EMAIL_DOMAIN}`));
}

export async function anonymizeUser(
  userId: string,
  /** vertrekreden: de vrijwillige keuze uit lib/privacy/vertrekredenen.ts (geen vrije tekst) */
  opts: { actorUserId?: string | null; reason?: string; vertrekreden?: string | undefined } = {},
): Promise<ErasureReport> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      freelancerProfile: {
        select: { id: true, companyRegistrationId: true },
      },
    },
  });
  if (!user) {
    throw new Error(`anonymizeUser: no user ${userId}`);
  }

  const erasedAt = new Date();
  if (user.email.endsWith(`@${ERASED_EMAIL_DOMAIN}`)) {
    return {
      userId,
      alreadyErased: true,
      erasedAt: erasedAt.toISOString(),
      cleared: {},
      retained: RETENTION_RULES.filter((r) => r.blocksErasure).map((r) => ({
        key: r.key,
        label: r.label,
        basis: r.basis,
        days: r.days,
      })),
    };
  }

  const oldName = user.fullName;
  const oldEmail = user.email;
  const oldPhone = user.phone;
  const profileId = user.freelancerProfile?.id ?? null;
  const cleared: Record<string, number> = {};

  // Upload ids to purge (bytes + row) after the transaction.
  const uploadIds = new Set<string>();
  for (const doc of await prisma.complianceDocument.findMany({
    where: { userId },
    select: { uploadId: true },
  })) {
    uploadIds.add(doc.uploadId);
  }
  for (const cert of await prisma.certificate.findMany({
    where: { userId, uploadId: { not: null } },
    select: { uploadId: true },
  })) {
    if (cert.uploadId) uploadIds.add(cert.uploadId);
  }

  // "Verder op je telefoon": de tijdelijke ID-foto's zitten alleen in de verzegelde KV-rij,
  // die hieronder verdwijnt. Eerst de foto's zelf weg, anders blijven ze voorgoed staan.
  await annuleerOverdracht(userId).catch((err) =>
    logger.warn("erasure: id-overdracht opruimen mislukt", { error: (err as Error).message }),
  );

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        fullName: "Verwijderde gebruiker",
        email: erasedEmail(userId),
        phone: null,
        passwordHash: null,
        disabledAt: erasedAt,
      },
    });
    cleared.account = 1;

    if (profileId) {
      await tx.freelancerProfile.update({
        where: { id: profileId },
        data: {
          kvkNumber: `DELETED-${userId}`,
          vatNumber: null,
          kvkValid: false,
          vatValid: false,
          payoutIban: null,
          stripeConnectedAccountId: null,
          stripePayoutsEnabled: false,
          homeLatitude: 0,
          homeLongitude: 0,
          homePostalCode: "0000XX",
        },
      });
      cleared.freelancer_profile = 1;

      const cregId = user.freelancerProfile?.companyRegistrationId;
      if (cregId) {
        // Only anonymise a registration this freelancer solely owns.
        const owners = await tx.freelancerProfile.count({
          where: { companyRegistrationId: cregId },
        });
        if (owners <= 1) {
          await tx.companyRegistration.update({
            where: { id: cregId },
            data: {
              legalName: REDACTION,
              tradeName: null,
              street: null,
              houseNumber: null,
              postalCode: null,
              city: null,
              vatNumber: null,
            },
          });
          cleared.company_registration = 1;
        }
      }
    }

    cleared.kyc = (
      await tx.identityVerification.deleteMany({ where: { userId } })
    ).count;

    cleared.device_fingerprint = (
      await tx.deviceFingerprint.deleteMany({ where: { userId } })
    ).count;

    cleared.password_reset_tokens = (
      await tx.passwordResetToken.deleteMany({ where: { userId } })
    ).count;

    // Passkeys: het account blijft (geanonimiseerd) bestaan, dus de cascade grijpt
    // niet; zonder dit kon een oud toestel nog bij dit account.
    cleared.passkeys = (
      await tx.passkey.deleteMany({ where: { userId } })
    ).count;

    // NFC key fobs for check-in terminals (lib/incheck/store.ts): the fob → user
    // mapping is keyed by the fob's hash, so it is found through the user's own list.
    const fobs = await tx.keyValueStore.findUnique({ where: { key: `nfc-fob-user:${userId}` }, select: { value: true } });
    const fobHashes = ((fobs?.value as { fobs?: { hash?: string }[] } | null)?.fobs ?? []).map((f) => f.hash).filter((h): h is string => typeof h === "string");
    if (fobHashes.length) await tx.keyValueStore.deleteMany({ where: { key: { in: fobHashes.map((h) => `nfc-fob:${h}`) } } });

    // Personal JSON in the KeyValueStore without a retention duty (agenda,
    // trips, chat settings, contacts, AI memory, 2FA, mailbox login).
    cleared.personal_settings = (
      await tx.keyValueStore.deleteMany({ where: erasableKvWhere(userId) })
    ).count;

    cleared.web_push = (
      await tx.webPushSubscription.deleteMany({
        where: { OR: [{ userId }, ...(profileId ? [{ freelancerId: profileId }] : [])] },
      })
    ).count;

    cleared.certificates = (
      await tx.certificate.deleteMany({ where: { userId } })
    ).count;
    cleared.compliance_documents = (
      await tx.complianceDocument.deleteMany({ where: { userId } })
    ).count;

    // Audit log stays append-only — scrub the PII inside it instead. The
    // tamper-evident hash chain covers only the immutable identity fields, so
    // rewriting summary / ipAddress / userAgent here does not break it.
    const auditRows = await tx.auditLog.findMany({
      where: {
        OR: [
          { actorUserId: userId },
          { targetType: "user", targetId: userId },
        ],
      },
      select: { id: true, summary: true },
    });
    for (const row of auditRows) {
      await tx.auditLog.update({
        where: { id: row.id },
        data: {
          summary: scrubSummary(row.summary, [oldName, oldEmail, oldPhone]),
          ipAddress: null,
          userAgent: null,
        },
      });
    }
    cleared.audit_log = auditRows.length;
  });

  // File bytes — outside the DB transaction, best effort.
  for (const id of uploadIds) {
    await deleteUpload(id).catch((err) =>
      logger.warn("erasure: upload delete failed", {
        uploadId: id,
        error: (err as Error).message,
      }),
    );
  }

  // Op locatie (kentekens, logregels, het kenteken van de werker): best effort, het wissen houdt niet op een fout
  await wisPersoonUitLocatie(userId)
    .then((r) => {
      cleared.locatie = r.registraties + r.logregels + (r.voertuig ? 1 : 0);
    })
    .catch((err) =>
      logger.warn("erasure: op-locatie wissen mislukt", { error: (err as Error).message }),
    );

  await recordAudit({
    category: "SECURITY",
    action: "privacy.user.erased",
    severity: "critical",
    actorUserId: opts.actorUserId ?? null,
    actorLabel: opts.actorUserId ? "user" : "system",
    summary: `Account ${userId} geanonimiseerd (AVG art. 17)${
      opts.reason ? ` — ${opts.reason}` : ""
    }`,
    targetType: "user",
    targetId: userId,
    metadata: { cleared, ...(opts.vertrekreden ? { vertrekreden: opts.vertrekreden } : {}) },
  });
  recordUserErased();

  return {
    userId,
    alreadyErased: false,
    erasedAt: erasedAt.toISOString(),
    cleared,
    retained: RETENTION_RULES.filter((r) => r.blocksErasure).map((r) => ({
      key: r.key,
      label: r.label,
      basis: r.basis,
      days: r.days,
    })),
  };
}

/** Categories an erasure request clears immediately, for the confirmation UI. */
export function erasureScope(): string[] {
  return erasableNow().map((r) => r.label);
}
