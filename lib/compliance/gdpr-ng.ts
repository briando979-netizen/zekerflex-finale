import { prisma } from "@/lib/prisma";
import { AuditLogger } from "@/lib/audit";
import crypto from "crypto";
import { amsterdamClock } from "@/lib/time/amsterdam";

export interface DataExportRequest {
  userId: string;
  tenantId: string;
  requestedAt: Date;
  status: "pending" | "processing" | "ready" | "expired";
  expiresAt: Date;
  downloadUrl?: string;
}

export interface ConsentRecord {
  userId: string;
  consentType: "marketing" | "analytics" | "cookies" | "third_party";
  given: boolean;
  grantedAt: Date;
  source: "opt_in" | "opt_out" | "explicit";
  version: string;
}

/**
 * Verzoek om data-export (AVG Artikel 15 - Recht op inzage)
 */
export async function requestDataExport(
  userId: string,
  tenantId: string,
  ipAddress?: string
): Promise<DataExportRequest> {
  const expiresAt = new Date(
    amsterdamClock.now().getTime() + 30 * 24 * 60 * 60 * 1000
  ); // 30 dagen

  const gdprRequest = await prisma.gdprRequest.create({
    data: {
      userId,
      tenantId,
      requestType: "export",
      status: "pending",
      format: "json",
      expiresAt,
      ipAddress,
    },
  });

  await AuditLogger.log({
    userId,
    action: "CREATE",
    resource: "GdprRequest",
    resourceId: gdprRequest.id,
    status: "SUCCESS",
    metadata: { type: "data_export_requested", tenantId },
    ipAddress,
  });

  const request: DataExportRequest = {
    userId,
    tenantId,
    requestedAt: gdprRequest.createdAt,
    status: gdprRequest.status as any,
    expiresAt,
  };

  return request;
}

/**
 * Verzoek om gegevenswissing (AVG Artikel 17 - Recht op vergetelheid)
 */
export async function requestDataDeletion(
  userId: string,
  tenantId: string,
  reason?: string,
  ipAddress?: string
): Promise<boolean> {
  const deletionDate = new Date(
    amsterdamClock.now().getTime() + 30 * 24 * 60 * 60 * 1000
  ); // 30 dagen (GDPR geeft ruimte voor 30 dagen)

  const gdprRequest = await prisma.gdprRequest.create({
    data: {
      userId,
      tenantId,
      requestType: "deletion",
      status: "pending",
      reason,
      expiresAt: deletionDate,
      ipAddress,
    },
  });

  await AuditLogger.log({
    userId,
    action: "DELETE",
    resource: "GdprRequest",
    resourceId: gdprRequest.id,
    status: "SUCCESS",
    metadata: { type: "deletion_requested", tenantId, reason },
    ipAddress,
  });

  // Achtergrond-taak ingeplanned voor harde verwijdering op deletionDate

  return true;
}

/**
 * Export alle gebruikersgegevens (GDPR compliance)
 */
export async function exportUserData(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      memberships: true,
      deviceFingerprints: true,
      identityChecks: true,
      webPushSubscriptions: true,
    },
  });

  if (!user) {
    throw new Error("Gebruiker niet gevonden");
  }

  const userData = {
    profile: sanitizeForGDPR(user),
    memberships: user.memberships,
    // Voeg meer entiteiten toe indien nodig
    exportedAt: new Date(),
    exportVersion: "1.0",
  };

  return userData;
}

/**
 * Verzoek tot gegevensbeperking (AVG Artikel 18)
 */
export async function requestDataRestriction(
  userId: string,
  tenantId: string,
  reason?: string,
  ipAddress?: string
) {
  return await prisma.gdprRequest.create({
    data: {
      userId,
      tenantId,
      requestType: "restriction",
      status: "pending",
      reason,
      ipAddress,
    },
  });
}

/**
 * Bezwaar tegen verwerking (AVG Artikel 21)
 */
export async function objectToProcessing(
  userId: string,
  tenantId: string,
  processingType: string,
  ipAddress?: string
) {
  return await prisma.gdprRequest.create({
    data: {
      userId,
      tenantId,
      requestType: "objection",
      status: "pending",
      reason: `Bezwaar tegen: ${processingType}`,
      ipAddress,
    },
  });
}

/**
 * Record toestemming (AVG compliance)
 */
export async function recordConsent(
  userId: string,
  consentType: ConsentRecord["consentType"],
  given: boolean,
  version: string,
  ipAddress?: string
): Promise<ConsentRecord> {
  // In productie: append-only log, nooit updaten
  const record: ConsentRecord = {
    userId,
    consentType,
    given,
    grantedAt: new Date(),
    source: given ? "explicit" : "opt_out",
    version,
  };

  await AuditLogger.log({
    userId,
    action: "UPDATE",
    resource: "GdprConsent",
    resourceId: `${userId}-${consentType}`,
    status: "SUCCESS",
    metadata: { consentType, given, version },
    ipAddress,
  });

  // Store in database
  await prisma.gdprConsent.create({
    data: {
      userId,
      consentType,
      given,
      version,
    },
  });

  return record;
}

/**
 * Haal huidige toestemming-status op
 */
export async function getConsentStatus(userId: string) {
  const consents = await prisma.gdprConsent.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    distinct: ["consentType"],
  });

  const status: Record<string, boolean> = {
    marketing: false,
    analytics: false,
    cookies: false,
    third_party: false,
  };

  for (const consent of consents) {
    status[consent.consentType] = consent.given;
  }

  return status;
}

/**
 * Sanitiseer gevoelige gegevens voor export
 */
export function sanitizeForGDPR(data: any): any {
  const sensitive = [
    "password",
    "passwordHash",
    "ssn",
    "creditCard",
    "bankAccount",
    "apiKey",
    "token",
    "secret",
  ];

  if (typeof data === "object" && data !== null && !Array.isArray(data)) {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(data)) {
      if (sensitive.some((s) => key.toLowerCase().includes(s.toLowerCase()))) {
        sanitized[key] = "***REDACTED***";
      } else {
        sanitized[key] = sanitizeForGDPR(value);
      }
    }
    return sanitized;
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeForGDPR(item));
  }

  return data;
}

/**
 * Haal data-retention policy op voor bepaald gegevenstype
 */
export async function getDataRetentionPolicy(dataType: string) {
  const policies: Record<string, { retentionDays: number; purpose: string }> = {
    audit_logs: {
      retentionDays: 2555,
      purpose: "Compliance (7 jaar)",
    },
    user_profile: {
      retentionDays: 365,
      purpose: "Accountbeheer",
    },
    payment_records: {
      retentionDays: 2555,
      purpose: "Belasting/juridisch (7 jaar)",
    },
    marketing_consent: {
      retentionDays: 365,
      purpose: "Marketing compliance",
    },
    website_logs: {
      retentionDays: 90,
      purpose: "Beveiliging",
    },
  };

  return (
    policies[dataType] || {
      retentionDays: 90,
      purpose: "Standaard beleid",
    }
  );
}

/**
 * Genereer Data Protection Impact Assessment (DPIA) rapport
 */
export async function generateDpiaReport() {
  return {
    reportDate: new Date(),
    assessmentVersion: "1.0",
    dataProcessingActivities: [
      {
        activity: "Shift matching",
        purpose: "Koppel freelancers aan klussen",
        legalBasis: "Contract",
        recipients: ["Employers", "Freelancers"],
      },
      {
        activity: "Invoicing",
        purpose: "Financiële administratie",
        legalBasis: "Legal obligation",
        recipients: ["Tax authorities"],
      },
    ],
    retentionPolicies: [
      { dataType: "Audit logs", retentionMonths: 84 },
      { dataType: "Transaction records", retentionMonths: 84 },
    ],
    riskAssessment: {
      highRiskAreas: [],
      mitigationMeasures: [
        "Encryption at rest and in transit",
        "Role-based access control",
        "Regular security audits",
      ],
    },
  };
}

/**
 * Meld datalekbreuk (AVG Artikel 33 & 34)
 */
export async function notifyOfBreach(
  affectedUserIds: string[],
  breachType: string,
  severity: "low" | "medium" | "high"
) {
  const notificationDeadline = new Date(
    amsterdamClock.now().getTime() + 72 * 60 * 60 * 1000
  ); // 72 uur

  const breachRecord = {
    reportedAt: new Date(),
    affectedUserCount: affectedUserIds.length,
    breachType,
    severity,
    notificationDeadline,
    measures: [
      "Betrokken gebruikers op de hoogte stellen",
      "Toezichthoudende autoriteit informeren (indien nodig)",
      "Beveiligingsmaatregelen implementeren",
    ],
  };

  await AuditLogger.log({
    userId: "system",
    action: "ALERT",
    resource: "DataBreach",
    resourceId: breachType,
    status: "SUCCESS",
    metadata: breachRecord,
  });

  // In productie: stuur mails naar betrokken gebruikers
  // Dien rapport in bij toezichthoudende autoriteit als nodig

  return breachRecord;
}

/**
 * Haal GDPR-verzoeken op per gebruiker
 */
export async function getUserGdprRequests(userId: string, tenantId: string) {
  return await prisma.gdprRequest.findMany({
    where: { userId, tenantId },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Processer ausstehend GDPR-verzoek
 */
export async function processGdprRequest(
  requestId: string,
  processingUserId: string
) {
  const request = await prisma.gdprRequest.findUnique({
    where: { id: requestId },
  });

  if (!request) {
    throw new Error("GDPR-verzoek niet gevonden");
  }

  const updated = await prisma.gdprRequest.update({
    where: { id: requestId },
    data: {
      status: "processing",
      processedAt: new Date(),
      processedBy: processingUserId,
    },
  });

  await AuditLogger.log({
    userId: processingUserId,
    action: "UPDATE",
    resource: "GdprRequest",
    resourceId: requestId,
    status: "SUCCESS",
    metadata: { status: "processing", type: request.requestType },
  });

  return updated;
}

/**
 * Voltooi GDPR-verzoek
 */
export async function completeGdprRequest(
  requestId: string,
  downloadUrl?: string
) {
  return await prisma.gdprRequest.update({
    where: { id: requestId },
    data: {
      status: "completed",
      downloadUrl,
      completedAt: new Date(),
    },
  });
}
