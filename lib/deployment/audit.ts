export interface AuditEntry {
  id: string;
  timestamp: Date;
  action: string;
  actor: string;
  resource: string;
  resourceId: string;
  changes?: Record<string, { from: any; to: any }>;
  result: "success" | "failure" | "warning";
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
}

export interface AuditFilter {
  action?: string;
  actor?: string;
  resource?: string;
  result?: "success" | "failure" | "warning";
  startTime?: Date;
  endTime?: Date;
}

const auditLog: AuditEntry[] = [];
let auditIdCounter = 1;

export function logAudit(
  action: string,
  actor: string,
  resource: string,
  resourceId: string,
  result: "success" | "failure" | "warning" = "success",
  changes?: Record<string, { from: any; to: any }>,
  metadata?: Record<string, any>
): AuditEntry {
  const id = `audit-${auditIdCounter++}`;

  const entry: AuditEntry = {
    id,
    timestamp: new Date(),
    action,
    actor,
    resource,
    resourceId,
    result,
    changes,
    metadata,
  };

  auditLog.push(entry);

  if (auditLog.length > 50000) {
    auditLog.shift();
  }

  return entry;
}

export function getAuditEntry(id: string): AuditEntry | null {
  return auditLog.find(e => e.id === id) || null;
}

export function queryAuditLog(filter: AuditFilter, limit: number = 100): AuditEntry[] {
  let filtered = [...auditLog];

  if (filter.action) {
    filtered = filtered.filter(e => e.action === filter.action);
  }

  if (filter.actor) {
    filtered = filtered.filter(e => e.actor === filter.actor);
  }

  if (filter.resource) {
    filtered = filtered.filter(e => e.resource === filter.resource);
  }

  if (filter.result) {
    filtered = filtered.filter(e => e.result === filter.result);
  }

  if (filter.startTime) {
    filtered = filtered.filter(e => e.timestamp >= filter.startTime!);
  }

  if (filter.endTime) {
    filtered = filtered.filter(e => e.timestamp <= filter.endTime!);
  }

  return filtered.slice(-limit);
}

export function getActorHistory(actor: string, limit: number = 100): AuditEntry[] {
  return queryAuditLog({ actor }, limit);
}

export function getResourceHistory(resource: string, resourceId: string, limit: number = 100): AuditEntry[] {
  const filtered = auditLog.filter(e => e.resource === resource && e.resourceId === resourceId);
  return filtered.slice(-limit);
}

export function getFailures(limit: number = 100): AuditEntry[] {
  return queryAuditLog({ result: "failure" }, limit);
}

export function getUserActions(actor: string, action: string): AuditEntry[] {
  return auditLog.filter(e => e.actor === actor && e.action === action);
}

export function exportAuditLog(format: "json" | "csv" = "json", filter?: AuditFilter): string {
  const entries = queryAuditLog(filter || {}, 10000);

  if (format === "csv") {
    const headers = ["ID", "Timestamp", "Action", "Actor", "Resource", "ResourceId", "Result"];
    const rows = entries.map(e => [
      e.id,
      e.timestamp.toISOString(),
      e.action,
      e.actor,
      e.resource,
      e.resourceId,
      e.result,
    ]);

    return [headers, ...rows].map(row => row.join(",")).join("\n");
  }

  return JSON.stringify(entries, null, 2);
}

export function getAuditStats() {
  const total = auditLog.length;
  const successes = auditLog.filter(e => e.result === "success").length;
  const failures = auditLog.filter(e => e.result === "failure").length;
  const warnings = auditLog.filter(e => e.result === "warning").length;

  const actions = new Map<string, number>();
  for (const entry of auditLog) {
    actions.set(entry.action, (actions.get(entry.action) || 0) + 1);
  }

  const actors = new Map<string, number>();
  for (const entry of auditLog) {
    actors.set(entry.actor, (actors.get(entry.actor) || 0) + 1);
  }

  return {
    totalEntries: total,
    successes,
    failures,
    warnings,
    successRate: total > 0 ? (successes / total) * 100 : 0,
    topActions: Array.from(actions.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10),
    topActors: Array.from(actors.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10),
  };
}

export function clearOldAuditEntries(olderThan: Date): number {
  const before = auditLog.length;
  const filtered = auditLog.filter(e => e.timestamp >= olderThan);
  auditLog.length = 0;
  auditLog.push(...filtered);
  return before - auditLog.length;
}
