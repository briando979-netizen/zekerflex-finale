import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getPrefs } from "@/lib/prefs/store";
import { exportUserKv } from "@/lib/privacy/user-kv";

// ---------------------------------------------------------------------------
// Data subject access request (AVG art. 15 inzage + art. 20 dataportabiliteit).
//
// `exportUserData` gathers everything the platform holds about one person into
// one structured JSON document. Uploaded files themselves are not inlined —
// they stay downloadable from their own endpoints — but their metadata is
// listed. Internal-only fields (password hash, raw KYC biometrics, other
// users' data) are excluded.
// ---------------------------------------------------------------------------

export interface DataExport {
  generatedAt: string;
  subject: { userId: string };
  note: string;
  sections: Record<string, unknown>;
}

async function safe<T>(label: string, fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (err) {
    logger.warn("data export section failed", { label, error: (err as Error).message });
    return { error: (err as Error).message };
  }
}

export async function exportUserData(userId: string): Promise<DataExport> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      fullName: true,
      phone: true,
      kycStatus: true,
      emailVerifiedAt: true,
      lastLoginAt: true,
      disabledAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!user) throw new Error(`exportUserData: no user ${userId}`);

  const profile = await prisma.freelancerProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  const fpId = profile?.id ?? null;

  const sections: Record<string, unknown> = {};

  sections.account = user;

  sections.memberships = await safe("memberships", () =>
    prisma.membership.findMany({
      where: { userId },
      select: { role: true, tenantId: true, createdAt: true },
    }),
  );

  sections.preferences = await safe("preferences", () => getPrefs(userId));

  sections.freelancerProfile = await safe("freelancerProfile", async () =>
    fpId
      ? prisma.freelancerProfile.findUnique({
          where: { id: fpId },
          include: {
            skills: { select: { skillId: true, rating: true, shiftsWorked: true } },
            companyRegistration: true,
          },
        })
      : null,
  );

  sections.identityVerification = await safe("identityVerification", () =>
    prisma.identityVerification.findMany({
      where: { userId },
      // decision + timestamps only — not rawPayload / biometric scores
      select: {
        provider: true,
        status: true,
        decisionStatus: true,
        documentType: true,
        verifiedAt: true,
        expiresAt: true,
        createdAt: true,
      },
    }),
  );

  sections.certificates = await safe("certificates", () =>
    prisma.certificate.findMany({
      where: { userId },
      select: {
        type: true,
        customLabel: true,
        number: true,
        issuedOn: true,
        expiresOn: true,
        status: true,
        fileName: true,
        addedAt: true,
        verifiedAt: true,
      },
    }),
  );

  sections.verificationDocuments = await safe("verificationDocuments", () =>
    prisma.complianceDocument.findMany({
      where: { userId },
      select: { kind: true, status: true, note: true, uploadedAt: true },
    }),
  );

  // recht om te werken per land: verklaring en status van het bewijs (lib/werkrecht)
  sections.workRights = await safe("workRights", () =>
    prisma.workRight.findMany({
      where: { userId },
      select: { country: true, declaredAt: true, declaration: true, status: true, validUntil: true, note: true, reviewedAt: true, createdAt: true },
    }),
  );

  if (fpId) {
    sections.shiftAssignments = await safe("shiftAssignments", () =>
      prisma.shiftAssignment.findMany({
        where: { freelancerId: fpId },
        select: {
          shiftId: true,
          source: true,
          acceptedAt: true,
          cancelledAt: true,
          cancelReason: true,
        },
      }),
    );

    sections.timesheets = await safe("timesheets", () =>
      prisma.timesheet.findMany({
        where: { freelancerId: fpId },
        select: {
          id: true,
          status: true,
          scheduledStart: true,
          scheduledEnd: true,
          actualStart: true,
          actualEnd: true,
          breakMinutes: true,
          billableMinutes: true,
          hourlyRateCents: true,
          extraCostsCents: true,
          extraCostsNote: true,
          submittedAt: true,
          approvedAt: true,
        },
      }),
    );

    sections.offersReceived = await safe("offersReceived", () =>
      prisma.shiftMatch.findMany({
        where: { freelancerId: fpId },
        select: {
          shiftId: true,
          status: true,
          score: true,
          travelMinutes: true,
          distanceMeters: true,
          notifiedAt: true,
          respondedAt: true,
          expiresAt: true,
        },
      }),
    );

    sections.modelAgreements = await safe("modelAgreements", () =>
      prisma.modelAgreement.findMany({
        where: { freelancerId: fpId },
        select: {
          reference: true,
          templateKey: true,
          templateVersion: true,
          clientLegalName: true,
          scopeDescription: true,
          freelancerSignedAt: true,
          clientSignedAt: true,
          createdAt: true,
        },
      }),
    );

    sections.invoices = await safe("invoices", () =>
      prisma.invoice.findMany({
        where: { issuerFreelancerId: fpId },
        select: {
          number: true,
          type: true,
          status: true,
          subtotalCents: true,
          vatCents: true,
          totalCents: true,
          issuedAt: true,
          paidAt: true,
        },
      }),
    );

    sections.engagementEvents = await safe("engagementEvents", () =>
      prisma.engagementEvent.findMany({
        where: { freelancerId: fpId },
        select: { kind: true, occurredAt: true },
        orderBy: { occurredAt: "desc" },
        take: 1000,
      }),
    );

  }

  sections.webPushSubscriptions = await safe("webPushSubscriptions", () =>
    prisma.webPushSubscription.findMany({
      where: { OR: [{ userId }, ...(fpId ? [{ freelancerId: fpId }] : [])] },
      select: { endpoint: true, userAgent: true, lastSeenAt: true, disabledAt: true },
    }),
  );

  // De lijst toestellen waarmee je inlogt (passkeys); de publieke sleutel en de teller zijn techniek, geen gegevens over jou.
  sections.passkeys = await safe("passkeys", () =>
    prisma.passkey.findMany({
      where: { userId },
      select: { name: true, transports: true, backedUp: true, createdAt: true, lastUsedAt: true },
      orderBy: { createdAt: "asc" },
    }),
  );

  sections.payslips = await safe("payslips", () =>
    prisma.payslipRecord.findMany({
      where: { userId },
      select: { isoWeek: true, data: true, createdAt: true },
    }),
  );

  sections.deviceFingerprints = await safe("deviceFingerprints", () =>
    prisma.deviceFingerprint.findMany({
      where: { userId },
      select: { hardwareHash: true, platform: true, trusted: true, firstSeenAt: true, lastSeenAt: true },
    }),
  );

  sections.disputesRaised = await safe("disputesRaised", () =>
    prisma.dispute.findMany({
      where: { raisedById: userId },
      select: { timesheetId: true, origin: true, status: true, createdAt: true, resolvedAt: true },
    }),
  );

  // Per-user JSON in the KeyValueStore (agenda, trips, chat settings, contacts,
  // AI memory, …) — credentials redacted. See lib/privacy/user-kv.ts.
  sections.storedSettings = await safe("storedSettings", () => exportUserKv(userId));

  sections.auditTrail = await safe("auditTrail", () =>
    prisma.auditLog.findMany({
      where: { OR: [{ actorUserId: userId }, { targetType: "user", targetId: userId }] },
      select: { category: true, action: true, summary: true, severity: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 2000,
    }),
  );

  return {
    generatedAt: new Date().toISOString(),
    subject: { userId },
    note: "AVG art. 15/20 export. Geüploade bestanden zelf zitten hier niet in; die download je apart. Interne velden (wachtwoordhash, ruwe KYC-biometrie) zijn uitgesloten.",
    sections,
  };
}

export function exportFilename(userId: string, at: Date = new Date()): string {
  const day = at.toISOString().slice(0, 10);
  return `zekerflex-gegevens-${userId}-${day}.json`;
}
