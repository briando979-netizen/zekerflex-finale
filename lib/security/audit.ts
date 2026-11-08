import { prisma } from "@/lib/prisma";

export type AuditAction = 
  | "CREATE" | "UPDATE" | "DELETE" | "LOGIN" | "LOGOUT"
  | "BOOK" | "CANCEL" | "PAY" | "APPROVE" | "REJECT"
  | "EXPORT" | "IMPORT" | "PUBLISH" | "ARCHIVE";

export async function logAudit(
  userId: string,
  action: AuditAction,
  resource: string,
  resourceId: string,
  changes?: Record<string, any>
) {
  return await prisma.auditLog.create({
    data: {
      userId,
      action,
      resource,
      resourceId,
      changes: changes ? JSON.stringify(changes) : null,
      timestamp: new Date(),
      ipAddress: "",
      userAgent: "",
    },
  });
}

export async function getAuditTrail(resourceId: string, limit = 50) {
  return await prisma.auditLog.findMany({
    where: { resourceId },
    orderBy: { timestamp: "desc" },
    take: limit,
  });
}

export async function getUserAuditTrail(userId: string, limit = 100) {
  return await prisma.auditLog.findMany({
    where: { userId },
    orderBy: { timestamp: "desc" },
    take: limit,
  });
}

export async function generateComplianceReport(tenantId: string, days = 30) {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const logs = await prisma.auditLog.findMany({
    where: {
      timestamp: { gte: startDate },
    },
  });

  const actionCounts: Record<string, number> = {};
  const userActions: Record<string, number> = {};

  for (const log of logs) {
    actionCounts[log.action] = (actionCounts[log.action] || 0) + 1;
    userActions[log.userId] = (userActions[log.userId] || 0) + 1;
  }

  return {
    period: `Last ${days} days`,
    totalActions: logs.length,
    actionBreakdown: actionCounts,
    topUsers: Object.entries(userActions)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5),
  };
}
