interface LogEntry {
  timestamp: number;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';
  message: string;
  context?: Record<string, unknown>;
  tags?: string[];
  userId?: string;
  requestId?: string;
}

const logs: LogEntry[] = [];
const maxLogs = 10000;

export const log = (
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL',
  message: string,
  context?: Record<string, unknown>,
  tags?: string[],
  userId?: string,
  requestId?: string
): void => {
  const entry: LogEntry = {
    timestamp: Date.now(),
    level,
    message,
    context,
    tags,
    userId,
    requestId,
  };

  logs.push(entry);
  if (logs.length > maxLogs) logs.shift();
};

export const debug = (message: string, context?: Record<string, unknown>): void =>
  log('DEBUG', message, context);

export const info = (message: string, context?: Record<string, unknown>): void =>
  log('INFO', message, context);

export const warn = (message: string, context?: Record<string, unknown>): void =>
  log('WARN', message, context);

export const error = (message: string, context?: Record<string, unknown>): void =>
  log('ERROR', message, context);

export const fatal = (message: string, context?: Record<string, unknown>): void =>
  log('FATAL', message, context);

export const getLogs = (
  filter?: {
    level?: string;
    tag?: string;
    userId?: string;
    since?: number;
  }
): LogEntry[] => {
  return logs.filter((entry) => {
    if (filter?.level && entry.level !== filter.level) return false;
    if (filter?.tag && !entry.tags?.includes(filter.tag)) return false;
    if (filter?.userId && entry.userId !== filter.userId) return false;
    if (filter?.since && entry.timestamp < filter.since) return false;
    return true;
  });
};

export const exportLogs = (format: 'json' | 'csv' = 'json'): string => {
  if (format === 'json') {
    return JSON.stringify(logs, null, 2);
  }
  // CSV format
  const headers = ['timestamp', 'level', 'message', 'userId', 'requestId'];
  const rows = logs.map((l) =>
    headers.map((h) => JSON.stringify((l as Record<string, unknown>)[h])).join(',')
  );
  return [headers.join(','), ...rows].join('\n');
};

export const clearLogs = (): void => {
  logs.length = 0;
};

export const getLogStats = (): Record<string, number> => {
  const stats: Record<string, number> = {
    DEBUG: 0,
    INFO: 0,
    WARN: 0,
    ERROR: 0,
    FATAL: 0,
  };
  logs.forEach((l) => {
    stats[l.level]++;
  });
  return stats;
};
