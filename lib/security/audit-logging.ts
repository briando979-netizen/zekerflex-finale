/**
 * Security Audit & Logging
 *
 * Comprehensive audit trail for security events, access changes, and admin actions.
 */

import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";

export type EventType =
  | "login"
  | "logout"
  | "permission_denied"
  | "api_key_created"
  | "api_key_revoked"
  | "role_assigned"
  | "role_revoked"
  | "data_access"
  | "admin_action"
  | "config_change"
  | "security_alert";

export type Severity = "info" | "warning" | "critical";
export type Status = "success" | "failure";

export interface SecurityEventData {
  userId?: string;
  eventType: EventType;
  action: string;
  resource?: string;
  oldValue?: Record<string, any>;
  newValue?: Record<string, any>;
  severity?: Severity;
  ipAddress?: string;
  userAgent?: string;
  originHost?: string;
  status?: Status;
  failureReason?: string;
}

/**
 * Log a security event
 */
export async function logSecurityEvent(
  tenantId: string,
  event: SecurityEventData
): Promise<any> {
  const securityEvent = await prisma.securityEvent.create({
    data: {
      tenantId,
      userId: event.userId,
      eventType: event.eventType,
      action: event.action,
      resource: event.resource,
      oldValue: event.oldValue,
      newValue: event.newValue,
      severity: event.severity || "info",
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
      originHost: event.originHost,
      status: event.status || "success",
      failureReason: event.failureReason,
      timestamp: new Date()
    }
  });

  // Alert on critical events
  if (event.severity === "critical") {
    await handleCriticalEvent(tenantId, securityEvent);
  }

  return securityEvent;
}

/**
 * Get audit log for a tenant
 */
export async function getAuditLog(
  tenantId: string,
  options?: {
    startDate?: Date;
    endDate?: Date;
    eventType?: EventType;
    userId?: string;
    severity?: Severity;
    limit?: number;
    offset?: number;
  }
) {
  const where: any = { tenantId };

  if (options?.startDate || options?.endDate) {
    where.timestamp = {};
    if (options.startDate) where.timestamp.gte = options.startDate;
    if (options.endDate) where.timestamp.lte = options.endDate;
  }

  if (options?.eventType) where.eventType = options.eventType;
  if (options?.userId) where.userId = options.userId;
  if (options?.severity) where.severity = options.severity;

  return prisma.securityEvent.findMany({
    where,
    orderBy: { timestamp: "desc" },
    take: options?.limit || 100,
    skip: options?.offset || 0,
    include: { user: { select: { id: true, email: true, fullName: true } } }
  });
}

/**
 * Get security events for a user
 */
export async function getUserEvents(
  userId: string,
  tenantId: string,
  limit: number = 50
) {
  return prisma.securityEvent.findMany({
    where: {
      userId,
      tenantId
    },
    orderBy: { timestamp: "desc" },
    take: limit
  });
}

/**
 * Get events by severity
 */
export async function getEventsBySeverity(
  tenantId: string,
  severity: Severity,
  limit: number = 50
) {
  return prisma.securityEvent.findMany({
    where: {
      tenantId,
      severity
    },
    orderBy: { timestamp: "desc" },
    take: limit,
    include: { user: { select: { id: true, email: true } } }
  });
}

/**
 * Detect suspicious activity patterns
 */
export async function detectSuspiciousActivity(
  tenantId: string,
  userId: string,
  timeWindowMs: number = 3600000 // 1 hour
): Promise<{
  suspicious: boolean;
  reasons: string[];
  events: any[];
}> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - timeWindowMs);

  const events = await prisma.securityEvent.findMany({
    where: {
      tenantId,
      userId,
      timestamp: { gte: windowStart }
    },
    orderBy: { timestamp: "desc" }
  });

  const reasons: string[] = [];

  // Check for failed login attempts
  const failedLogins = events.filter(
    e => e.eventType === "login" && e.status === "failure"
  ).length;

  if (failedLogins >= 5) {
    reasons.push(`${failedLogins} failed login attempts in ${timeWindowMs / 3600000}h`);
  }

  // Check for permission denied events
  const deniedAccess = events.filter(
    e => e.eventType === "permission_denied"
  ).length;

  if (deniedAccess >= 10) {
    reasons.push(`${deniedAccess} permission denied events`);
  }

  // Check for rapid API key creation
  const apiKeysCreated = events.filter(
    e => e.eventType === "api_key_created"
  ).length;

  if (apiKeysCreated >= 5) {
    reasons.push(`${apiKeysCreated} API keys created rapidly`);
  }

  // Check for access from multiple IPs
  const ips = new Set(events.map(e => e.ipAddress).filter(Boolean));
  if (ips.size >= 5) {
    reasons.push(`Access from ${ips.size} different IP addresses`);
  }

  return {
    suspicious: reasons.length > 0,
    reasons,
    events
  };
}

/**
 * Export audit log as CSV
 */
export async function exportAuditLog(
  tenantId: string,
  startDate: Date,
  endDate: Date
): Promise<string> {
  const events = await getAuditLog(tenantId, {
    startDate,
    endDate
  });

  // CSV header
  const headers = [
    "Timestamp",
    "User ID",
    "Email",
    "Event Type",
    "Action",
    "Resource",
    "Severity",
    "Status",
    "IP Address",
    "Failure Reason"
  ];

  // CSV rows
  const rows = events.map(event => [
    event.timestamp.toISOString(),
    event.userId || "",
    event.user?.email || "",
    event.eventType,
    event.action,
    event.resource || "",
    event.severity,
    event.status,
    event.ipAddress || "",
    event.failureReason || ""
  ]);

  // Combine
  const csv = [
    headers.map(h => `"${h}"`).join(","),
    ...rows.map(r => r.map(v => `"${v}"`).join(","))
  ].join("\n");

  return csv;
}

/**
 * Clean up old audit logs (retention policy)
 */
export async function cleanupOldLogs(
  tenantId: string,
  retentionDays: number = 90
) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  const result = await prisma.securityEvent.deleteMany({
    where: {
      tenantId,
      timestamp: { lt: cutoffDate }
    }
  });

  return result.count;
}

/**
 * Get summary statistics for security events
 */
export async function getSecurityStats(
  tenantId: string,
  days: number = 30
) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const events = await prisma.securityEvent.findMany({
    where: {
      tenantId,
      timestamp: { gte: cutoffDate }
    }
  });

  // Count by event type
  const eventTypes: Record<string, number> = {};
  events.forEach(e => {
    eventTypes[e.eventType] = (eventTypes[e.eventType] || 0) + 1;
  });

  // Count by severity
  const severities: Record<string, number> = { info: 0, warning: 0, critical: 0 };
  events.forEach(e => {
    severities[e.severity] = (severities[e.severity] || 0) + 1;
  });

  // Count by status
  const statuses: Record<string, number> = { success: 0, failure: 0 };
  events.forEach(e => {
    statuses[e.status] = (statuses[e.status] || 0) + 1;
  });

  return {
    totalEvents: events.length,
    eventTypes,
    severities,
    statuses,
    daysAnalyzed: days
  };
}

/**
 * Handle critical security events
 */
async function handleCriticalEvent(tenantId: string, event: any) {
  // This could:
  // - Send alerts via email/Slack
  // - Trigger automated responses
  // - Create incident tickets
  // - Lock accounts

  console.warn(`CRITICAL SECURITY EVENT: ${event.eventType} - ${event.action}`);

  // TODO: Implement critical event handlers
}

/**
 * Generate security report
 */
export async function generateSecurityReport(
  tenantId: string,
  startDate: Date,
  endDate: Date
) {
  const events = await getAuditLog(tenantId, {
    startDate,
    endDate
  });

  const stats = await getSecurityStats(
    tenantId,
    Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
  );

  // Find top users
  const userEvents: Record<string, number> = {};
  events.forEach(e => {
    const key = e.user?.email || e.userId || "Unknown";
    userEvents[key] = (userEvents[key] || 0) + 1;
  });

  const topUsers = Object.entries(userEvents)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);

  return {
    period: { startDate, endDate },
    statistics: stats,
    topUsers,
    totalEvents: events.length,
    criticalEvents: events.filter(e => e.severity === "critical").length,
    failedAttempts: events.filter(e => e.status === "failure").length
  };
}
