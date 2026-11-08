import { prisma } from "@/lib/prisma";

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

export async function requestDataExport(userId: string, tenantId: string): Promise<DataExportRequest> {
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  const request: DataExportRequest = {
    userId,
    tenantId,
    requestedAt: new Date(),
    status: "pending",
    expiresAt,
  };

  // Queue background job to:
  // 1. Collect all user data
  // 2. Anonymize sensitive fields if needed
  // 3. Generate PDF/JSON export
  // 4. Upload to secure storage
  // 5. Send download link via email

  return request;
}

export async function exportUserData(userId: string): Promise<any> {
  // Export all data related to a user in portable format
  const userData = {
    profile: await prisma.user.findUnique({ where: { id: userId } }),
    invoices: await prisma.invoice.findMany({ where: { OR: [{ issuerId: userId }, { recipientId: userId }] } }),
    shifts: await prisma.shift.findMany({ where: { freelancerId: userId } }),
    payslips: await prisma.payslip.findMany({ where: { freelancerId: userId } }),
    // Add all other entities
  };

  return userData;
}

export async function requestDataDeletion(userId: string, reason?: string): Promise<boolean> {
  // GDPR Right to be Forgotten
  // 1. Soft-delete user data initially
  // 2. Hard-delete after retention period (GDPR allows 30 days for backup/safety)
  // 3. Log deletion request
  // 4. Notify user of completion

  const deletionScheduled = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  // Mark for deletion
  await prisma.user.update({
    where: { id: userId },
    data: {
      deletedAt: new Date(),
      // Store deletion reason in audit log, not user record
    },
  });

  // Queue background job for hard delete at deletionScheduled

  return true;
}

export async function recordConsent(
  userId: string,
  consentType: ConsentRecord["consentType"],
  given: boolean,
  version: string
): Promise<ConsentRecord> {
  const record: ConsentRecord = {
    userId,
    consentType,
    given,
    grantedAt: new Date(),
    source: given ? "explicit" : "opt_out",
    version,
  };

  // Store in database with immutable record
  // In production: use append-only log, never update

  return record;
}

export async function getConsentStatus(userId: string): Promise<Record<string, boolean>> {
  // Retrieve current consent status for all types
  return {
    marketing: false,
    analytics: false,
    cookies: false,
    third_party: false,
  };
}

export async function restrictProcessing(userId: string): Promise<boolean> {
  // GDPR Right to restrict processing
  // Mark account as restricted; continue processing only for necessary purposes
  // Suspend automated decision-making
  // Pause marketing communications

  return true;
}

export async function objectToProcessing(userId: string, processingType: string): Promise<boolean> {
  // GDPR Right to object
  // Stop processing immediately for specified type
  // Opt-out of marketing, profiling, automated decisions, etc.

  return true;
}

export async function portabilityRequest(userId: string): Promise<any> {
  // GDPR Right to data portability
  // Export data in standard format (JSON, CSV)
  // Include structured, commonly used, machine-readable format

  const portableData = {
    exportedAt: new Date(),
    format: "application/json",
    version: "1.0",
    data: await exportUserData(userId),
  };

  return portableData;
}

export async function generateDPAReport(): Promise<{
  reportDate: Date;
  dataProcessingActivities: any[];
  retentionPolicies: any[];
  thirdPartyProcessors: any[];
  riskAssessment: any;
}> {
  // Generate Data Processing Agreement (DPA) report for accountability
  // Required by GDPR Article 5(2)

  return {
    reportDate: new Date(),
    dataProcessingActivities: [],
    retentionPolicies: [],
    thirdPartyProcessors: [],
    riskAssessment: {},
  };
}

export async function notifyOfBreach(affectedUsers: string[], breachType: string, severity: "low" | "medium" | "high"): Promise<boolean> {
  // GDPR Article 33 & 34: Breach notification
  // 1. Notify supervisory authority within 72 hours (if high risk)
  // 2. Notify affected individuals without undue delay (if high risk)
  // 3. Document breach details
  // 4. Include: nature, scope, consequences, measures taken

  const breachRecord = {
    reportedAt: new Date(),
    affectedUserCount: affectedUsers.length,
    breachType,
    severity,
    notificationDeadline: new Date(Date.now() + 72 * 60 * 60 * 1000),
  };

  // Send emails to affected users with breach details and mitigation steps
  // File report with supervisory authority if severity is high

  return true;
}

export function sanitizeForGDPR(data: any): any {
  // Remove/anonymize sensitive fields before export
  const sensitive = ["password", "ssn", "creditCard", "bankAccount", "apiKey"];

  if (typeof data === "object" && data !== null) {
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

  return data;
}

export async function getDataRetentionPolicy(dataType: string): Promise<{ retentionDays: number; purpose: string }> {
  const policies: Record<string, { retentionDays: number; purpose: string }> = {
    audit_logs: { retentionDays: 2555, purpose: "Compliance (7 years)" },
    user_profile: { retentionDays: 365, purpose: "Account management" },
    payment_records: { retentionDays: 2555, purpose: "Tax/legal (7 years)" },
    marketing_consent: { retentionDays: 365, purpose: "Marketing compliance" },
    website_logs: { retentionDays: 90, purpose: "Security" },
  };

  return policies[dataType] || { retentionDays: 90, purpose: "Default policy" };
}

export async function scheduleDataDeletion(userId: string, dataType: string, deletionDate: Date): Promise<boolean> {
  // Schedule deletion of specific data type for user
  // Execute automatically on deletion date

  return true;
}
