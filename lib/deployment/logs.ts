export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: LogLevel;
  source: string;
  message: string;
  context?: Record<string, any>;
  deploymentId?: string;
}

export interface LogFilter {
  level?: LogLevel | LogLevel[];
  source?: string | string[];
  deploymentId?: string;
  startTime?: Date;
  endTime?: Date;
  searchTerm?: string;
}

const logs: LogEntry[] = [];
let logIdCounter = 1;

export function addLog(
  level: LogLevel,
  source: string,
  message: string,
  context?: Record<string, any>,
  deploymentId?: string
): LogEntry {
  const entry: LogEntry = {
    id: `log-${logIdCounter++}`,
    timestamp: new Date(),
    level,
    source,
    message,
    context,
    deploymentId,
  };

  logs.push(entry);

  if (logs.length > 10000) {
    logs.shift();
  }

  if (level === "error" || level === "fatal") {
    console.error(`[${source}] ${message}`, context);
  } else {
    console.log(`[${source}] ${message}`);
  }

  return entry;
}

export function queryLogs(filter: LogFilter, limit: number = 100): LogEntry[] {
  let filtered = [...logs];

  if (filter.level) {
    const levels = Array.isArray(filter.level) ? filter.level : [filter.level];
    filtered = filtered.filter(l => levels.includes(l.level));
  }

  if (filter.source) {
    const sources = Array.isArray(filter.source) ? filter.source : [filter.source];
    filtered = filtered.filter(l => sources.includes(l.source));
  }

  if (filter.deploymentId) {
    filtered = filtered.filter(l => l.deploymentId === filter.deploymentId);
  }

  if (filter.startTime) {
    filtered = filtered.filter(l => l.timestamp >= filter.startTime!);
  }

  if (filter.endTime) {
    filtered = filtered.filter(l => l.timestamp <= filter.endTime!);
  }

  if (filter.searchTerm) {
    const term = filter.searchTerm.toLowerCase();
    filtered = filtered.filter(l =>
      l.message.toLowerCase().includes(term) ||
      l.source.toLowerCase().includes(term)
    );
  }

  return filtered.slice(-limit);
}

export function getErrorLogs(deploymentId?: string, limit: number = 50): LogEntry[] {
  const filter: LogFilter = {
    level: ["error", "fatal"],
    deploymentId,
  };
  return queryLogs(filter, limit);
}

export function getDeploymentLogs(deploymentId: string, limit: number = 100): LogEntry[] {
  return queryLogs({ deploymentId }, limit);
}

export function aggregateLogsByLevel(): Record<LogLevel, number> {
  const counts: Record<LogLevel, number> = {
    debug: 0,
    info: 0,
    warn: 0,
    error: 0,
    fatal: 0,
  };

  for (const log of logs) {
    counts[log.level]++;
  }

  return counts;
}

export function getLogStats(): {
  totalLogs: number;
  byLevel: Record<LogLevel, number>;
  oldestLog: Date | null;
  newestLog: Date | null;
} {
  return {
    totalLogs: logs.length,
    byLevel: aggregateLogsByLevel(),
    oldestLog: logs.length > 0 ? logs[0].timestamp : null,
    newestLog: logs.length > 0 ? logs[logs.length - 1].timestamp : null,
  };
}

export function clearOldLogs(olderThan: Date): number {
  const before = logs.length;
  const filtered = logs.filter(l => l.timestamp >= olderThan);
  logs.length = 0;
  logs.push(...filtered);
  return before - logs.length;
}
