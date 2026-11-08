import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export interface AuditLogEntry {
  userId: string;
  action: "CREATE" | "READ" | "UPDATE" | "DELETE" | "LOGIN" | "LOGOUT" | "PERMISSION_CHANGE" | "ADMIN_ACTION";
  resource: string;
  resourceId: string;
  changes?: Record<string, { before: any; after: any }>;
  ipAddress: string;
  userAgent: string;
  status: "SUCCESS" | "FAILURE";
  reason?: string;
  metadata?: Record<string, any>;
}

export class AuditLogger {
  private static hashEntry(entry: AuditLogEntry): string {
    return crypto.createHash("sha256").update(JSON.stringify(entry)).digest("hex");
  }

  static async log(entry: AuditLogEntry): Promise<void> {
    const hash = this.hashEntry(entry);
    const timestamp = new Date();

    // Get previous log hash for immutable chain
    const previousLog = await prisma.auditLog.findFirst({
      orderBy: { createdAt: "desc" },
      take: 1,
    });

    await prisma.auditLog.create({
      data: {
        userId: entry.userId,
        action: entry.action,
        resource: entry.resource,
        resourceId: entry.resourceId,
        changes: entry.changes,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
        status: entry.status,
        reason: entry.reason,
        metadata: entry.metadata,
        hash,
        previousHash: previousLog?.hash || null,
        createdAt: timestamp,
      },
    });
  }

  static async getAuditTrail(filters: {
    userId?: string;
    resource?: string;
    action?: AuditLogEntry["action"];
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Promise<any[]> {
    const { userId, resource, action, startDate, endDate, limit = 100 } = filters;

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
    });
  }

  static async verifyChain(startIndex = 0, endIndex?: number): Promise<boolean> {
    const logs = await prisma.auditLog.findMany({
      orderBy: { createdAt: "asc" },
    });

    const end = endIndex || logs.length;
    for (let i = startIndex + 1; i < end; i++) {
      const current = logs[i];
      const previous = logs[i - 1];

      if (current.previousHash !== previous.hash) {
        return false; // Chain integrity broken
      }

      const expectedHash = this.hashEntry({
        userId: current.userId,
        action: current.action as any,
        resource: current.resource,
        resourceId: current.resourceId,
        changes: current.changes as any,
        ipAddress: current.ipAddress,
        userAgent: current.userAgent,
        status: current.status as any,
        reason: current.reason || undefined,
        metadata: current.metadata as any,
      });

      if (current.hash !== expectedHash) {
        return false; // Entry tampered
      }
    }

    return true;
  }

  static async exportTrail(format: "json" | "csv" = "json", filters?: any): Promise<string> {
    const logs = await this.getAuditTrail(filters);

    if (format === "json") {
      return JSON.stringify(logs, null, 2);
    }

    // CSV export
    if (logs.length === 0) return "No audit logs";

    const headers = Object.keys(logs[0]).join(",");
    const rows = logs.map((log: any) =>
      Object.values(log)
        .map((v) => (typeof v === "object" ? JSON.stringify(v) : v))
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );

    return [headers, ...rows].join("\n");
  }
}
