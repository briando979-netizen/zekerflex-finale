import { env } from "@/lib/env";

type Level = "debug" | "info" | "warn" | "error";

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN_LEVEL: Level = env.NODE_ENV === "production" ? "info" : "debug";

function emit(level: Level, message: string, context?: Record<string, unknown>) {
  if (ORDER[level] < ORDER[MIN_LEVEL]) return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
    ...context,
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export interface BoundLogger {
  debug: (m: string, c?: Record<string, unknown>) => void;
  info: (m: string, c?: Record<string, unknown>) => void;
  warn: (m: string, c?: Record<string, unknown>) => void;
  error: (m: string, c?: Record<string, unknown>) => void;
}

function bind(bound: Record<string, unknown>): BoundLogger {
  return {
    debug: (m, c) => emit("debug", m, { ...bound, ...c }),
    info: (m, c) => emit("info", m, { ...bound, ...c }),
    warn: (m, c) => emit("warn", m, { ...bound, ...c }),
    error: (m, c) => emit("error", m, { ...bound, ...c }),
  };
}

export const logger = {
  debug: (m: string, c?: Record<string, unknown>) => emit("debug", m, c),
  info: (m: string, c?: Record<string, unknown>) => emit("info", m, c),
  warn: (m: string, c?: Record<string, unknown>) => emit("warn", m, c),
  error: (m: string, c?: Record<string, unknown>) => emit("error", m, c),
  /** Bind a set of fields to every subsequent log line. */
  child: bind,
  /**
   * Bind the request's correlation id (set by middleware.ts on every /api/*
   * request, or generated here as a fallback for a route middleware didn't
   * cover) plus an optional route label — so every log line for one request
   * can be grepped/joined by the same id, from middleware through to the
   * route handler and any downstream service call.
   */
  forRequest(request: Request, extra?: Record<string, unknown>): BoundLogger {
    const correlationId = request.headers.get("x-correlation-id") ?? crypto.randomUUID();
    return bind({ correlationId, ...extra });
  },
};
