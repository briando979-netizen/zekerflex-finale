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

export const logger = {
  debug: (m: string, c?: Record<string, unknown>) => emit("debug", m, c),
  info: (m: string, c?: Record<string, unknown>) => emit("info", m, c),
  warn: (m: string, c?: Record<string, unknown>) => emit("warn", m, c),
  error: (m: string, c?: Record<string, unknown>) => emit("error", m, c),
  /** Bind a set of fields to every subsequent log line. */
  child(bound: Record<string, unknown>) {
    return {
      debug: (m: string, c?: Record<string, unknown>) => emit("debug", m, { ...bound, ...c }),
      info: (m: string, c?: Record<string, unknown>) => emit("info", m, { ...bound, ...c }),
      warn: (m: string, c?: Record<string, unknown>) => emit("warn", m, { ...bound, ...c }),
      error: (m: string, c?: Record<string, unknown>) => emit("error", m, { ...bound, ...c }),
    };
  },
};
