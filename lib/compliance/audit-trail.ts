import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export interface AuditLogEntry {
  userId: string;
  action:
    | "CREATE"
    | "READ"
    | "UPDATE"
    | "DELETE"
    | "LOGIN"
    | "LOGOUT"
    | "PERMISSION_CHANGE"
    | "ADMIN_ACTION"
    | "ALERT"
    | "EXPORT"
    | "IMPORT";
  resource: string;
  resourceId: string;
  changes?: Record<string, { before: any; after: any }>;
  ipAddress?: string;
  userAgent?: string;
  status: "SUCCESS" | "FAILURE";
  reason?: string;
  metadata?: Record<string, any>;
}

export interface AuditTrailQuery {
  userId?: string;
  resource?: string;
  action?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Log een actie in de audit trail
 * Implementeert een tamper-evident (onveranderlijke) keten met hashing
 */
export async function logAuditAction(
  entry: AuditLogEntry
): Promise<string> {
  // Haal vorige log-entry op voor keten-verificatie
  const previousLog = await prisma.auditLog.findFirst({
    orderBy: { seq: "desc" },
    take: 1,
  });

  // Bereken hash voor huidige entry (zonder PII zoals IP/userAgent)
  const hashData = {
    userId: entry.userId,
    action: entry.action,
    resource: entry.resource,
    resourceId: entry.resourceId,
    status: entry.status,
  };

  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify(hashData))
    .digest("hex");

  // Maak audit-log entry met keten-info
  const logEntry = await prisma.auditLog.create({
    data: {
      userId: entry.userId,
      action: entry.action,
      resource: entry.resource,
      resourceId: entry.resourceId,
      changes: entry.changes as any,
      ipAddress: entry.ipAddress,
      userAgent: entry.userAgent,
      status: entry.status,
      reason: entry.reason,
      metadata: entry.metadata as any,
      hash,
      previousHash: previousLog?.hash ?? null,
    },
  });

  return logEntry.id;
}

/**
 * Haal audit trail op met filters
 */
export async function getAuditTrail(
  query: AuditTrailQuery
): Promise<any[]> {
  const {
    userId,
    resource,
    action,
    startDate,
    endDate,
    limit = 100,
    offset = 0,
  } = query;

  return prisma.auditLog.findMany({
    where: {
      ...(userId && { userId }),
      ...(resource && { resource }),
      ...(action && { action }),
      ...(startDate && { createdAt: { gte: startDate } }),
      ...(endDate && { createdAt: { lte: endDate } }),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
  });
}

/**
 * Verifieer de integriteit van de audit keten
 * Controleer of hashes correct zijn en keten niet doorbroken
 */
export async function verifyAuditChain(
  startIndex: number = 0,
  endIndex?: number
): Promise<{
  isValid: boolean;
  brokenAt?: number;
  errors: string[];
}> {
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "asc" },
  });

  const end = endIndex ?? logs.length;
  const errors: string[] = [];

  for (let i = startIndex + 1; i < end; i++) {
    const current = logs[i];
    const previous = logs[i - 1];

    // Controleer vorige hash-verwijzing
    if (current.previousHash !== previous.hash) {
      errors.push(`Keten verbroken op index ${i}: previousHash mismatch`);
      return {
        isValid: false,
        brokenAt: i,
        errors,
      };
    }

    // Verifieer hash van huidi entry
    if (current.hash) {
      const expectedHash = crypto
        .createHash("sha256")
        .update(
          JSON.stringify({
            userId: current.userId,
            action: current.action,
            resource: current.resource,
            resourceId: current.resourceId,
            status: current.status,
          })
        )
        .digest("hex");

      if (current.hash !== expectedHash) {
        errors.push(
          `Hash mismatch op index ${i}: entry mogelijk gewijzigd`
        );
        return {
          isValid: false,
          brokenAt: i,
          errors,
        };
      }
    }
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Export audit trail als CSV
 */
export async function exportAuditTrailAsCSV(
  query: AuditTrailQuery,
  format: "json" | "csv" = "csv"
): Promise<string> {
  const logs = await getAuditTrail({ ...query, limit: 10000 });

  if (logs.length === 0) {
    return "Geen audit logs beschikbaar";
  }

  if (format === "json") {
    return JSON.stringify(logs, null, 2);
  }

  // CSV export
  const headers = [
    "Timestamp",
    "User ID",
    "Action",
    "Resource",
    "Resource ID",
    "Status",
    "IP Address",
    "Reason",
  ];

  const rows = logs.map((log) => [
    log.createdAt.toISOString(),
    log.userId,
    log.action,
    log.resource,
    log.resourceId,
    log.status,
    log.ipAddress ?? "-",
    log.reason ?? "-",
  ]);

  const csvContent = [
    headers.join(","),
    ...rows.map((r) =>
      r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")
    ),
  ].join("\n");

  return csvContent;
}

/**
 * Haal samenvatting van audit activiteiten op
 */
export async function getAuditSummary(
  startDate: Date,
  endDate: Date
) {
  const logs = await prisma.auditLog.findMany({
    where: {
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    },
  });

  const byAction = logs.reduce(
    (acc, log) => {
      if (!acc[log.action]) {
        acc[log.action] = 0;
      }
      acc[log.action]++;
      return acc;
    },
    {} as Record<string, number>
  );

  const byStatus = logs.reduce(
    (acc, log) => {
      if (!acc[log.status]) {
        acc[log.status] = 0;
      }
      acc[log.status]++;
      return acc;
    },
    {} as Record<string, number>
  );

  const byResource = logs.reduce(
    (acc, log) => {
      if (!acc[log.resource]) {
        acc[log.resource] = 0;
      }
      acc[log.resource]++;
      return acc;
    },
    {} as Record<string, number>
  );

  const failures = logs.filter((l) => l.status === "FAILURE");

  return {
    period: { startDate, endDate },
    totalActions: logs.length,
    byAction,
    byStatus,
    byResource,
    failureCount: failures.length,
    failureRate: logs.length > 0
      ? (failures.length / logs.length * 100).toFixed(2)
      : "0.00",
    topUsers: Object.entries(
      logs.reduce(
        (acc, log) => {
          if (!acc[log.userId]) {
            acc[log.userId] = 0;
          }
          acc[log.userId]++;
          return acc;
        },
        {} as Record<string, number>
      )
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10),
  };
}

/**
 * Zoek naar verdachte activiteiten in audit trail
 */
export async function detectAnomalies(
  startDate: Date,
  endDate: Date
) {
  const logs = await prisma.auditLog.findMany({
    where: {
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const anomalies: any[] = [];

  // Detecteer veel mislukte login-pogingen
  const failedLogins = logs.filter((l) =>
    l.action === "LOGIN" && l.status === "FAILURE"
  );

  const loginsByUser = failedLogins.reduce(
    (acc, log) => {
      if (!acc[log.userId]) {
        acc[log.userId] = [];
      }
      acc[log.userId].push(log.createdAt);
      return acc;
    },
    {} as Record<string, Date[]>
  );

  // Controleer voor brute-force pogingen
  for (const [userId, attempts] of Object.entries(loginsByUser)) {
    if (attempts.length > 5) {
      const timespan = attempts[attempts.length - 1].getTime() - attempts[0].getTime();
      const minutes = timespan / (1000 * 60);

      if (minutes < 15) {
        anomalies.push({
          type: "BRUTE_FORCE_LOGIN",
          userId,
          attempts: attempts.length,
          timespanMinutes: minutes.toFixed(1),
          severity: "high",
        });
      }
    }
  }

  // Detecteer bulk-verwijderingen door één gebruiker
  const deletesByUser = logs
    .filter((l) => l.action === "DELETE")
    .reduce(
      (acc, log) => {
        if (!acc[log.userId]) {
          acc[log.userId] = [];
        }
        acc[log.userId].push(log);
        return acc;
      },
      {} as Record<string, any[]>
    );

  for (const [userId, deletes] of Object.entries(deletesByUser)) {
    if (deletes.length > 50) {
      anomalies.push({
        type: "BULK_DELETE",
        userId,
        deleteCount: deletes.length,
        resources: [...new Set(deletes.map((d) => d.resource))],
        severity: "high",
      });
    }
  }

  // Detecteer acties van inactieve gebruikers
  const unusualTimeframes = logs.reduce(
    (acc, log) => {
      const hour = log.createdAt.getHours();
      if (hour < 5 || hour > 23) {
        // Buiten kantooruren
        if (!acc[log.userId]) {
          acc[log.userId] = 0;
        }
        acc[log.userId]++;
      }
      return acc;
    },
    {} as Record<string, number>
  );

  for (const [userId, count] of Object.entries(unusualTimeframes)) {
    if (count > 10) {
      anomalies.push({
        type: "UNUSUAL_HOURS",
        userId,
        actionCount: count,
        severity: "medium",
      });
    }
  }

  return anomalies;
}

/**
 * Genereer compliance rapport gebaseerd op audit trail
 */
export async function generateComplianceReport(
  startDate: Date,
  endDate: Date
) {
  const summary = await getAuditSummary(startDate, endDate);
  const anomalies = await detectAnomalies(startDate, endDate);
  const chainValid = await verifyAuditChain();

  return {
    reportDate: new Date(),
    period: { startDate, endDate },
    auditTrailIntegrity: {
      isValid: chainValid.isValid,
      errors: chainValid.errors,
    },
    activities: summary,
    anomaliesDetected: anomalies.length,
    anomalies: anomalies.slice(0, 20), // Top 20
    complianceStatus:
      chainValid.isValid && anomalies.length === 0 ? "COMPLIANT" : "AT_RISK",
  };
}

/**
 * Archiveer oude audit logs (3 jaar retentie minimum)
 */
export async function archiveOldAuditLogs(
  retentionDays: number = 1095 // 3 jaren
): Promise<number> {
  const archiveDate = new Date(
    Date.now() - retentionDays * 24 * 60 * 60 * 1000
  );

  // In productie: verplaats naar archief-systeem
  // Voorlopig: tel hoeveel logs kunnen worden gearchiveerd
  const logsToArchive = await prisma.auditLog.count({
    where: {
      createdAt: {
        lt: archiveDate,
      },
    },
  });

  return logsToArchive;
}
