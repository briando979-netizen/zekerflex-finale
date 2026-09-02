import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { llmHealth, type LlmHealth } from "@/lib/ai/client";
import { budgetSnapshot } from "@/lib/ai/governor";
import { ensureStorageWritable } from "@/lib/storage/local";

// ---------------------------------------------------------------------------
// Self-healing startup checks for The Sovereign Box.
//
// Runs on the first server boot (instrumentation.ts) and on demand via
// GET /api/admin/system. It VERIFIES and REPORTS; it does not auto-apply
// migrations - schema changes are a deliberate, reviewable deploy step, not
// something to race across app instances on boot. A pending migration is
// reported loudly with the one command that fixes it.
// ---------------------------------------------------------------------------

export interface StartupReport {
  ok: boolean;
  checkedAt: string;
  env: { ok: boolean; nodeEnv: string };
  database: {
    ok: boolean;
    latencyMs: number;
    appliedMigrations: number;
    pendingMigrations: string[];
    detail?: string;
  };
  redis: { ok: boolean; latencyMs: number; detail?: string };
  llm: LlmHealth & { localInference: boolean };
  rag: { enabled: boolean; tableReady: boolean; chunks: number };
  storage: { dir: string; writable: boolean; detail?: string };
  budget: Awaited<ReturnType<typeof budgetSnapshot>> | null;
}

async function timed<T>(fn: () => Promise<T>): Promise<{ ms: number; value: T }> {
  const t = Date.now();
  const value = await fn();
  return { ms: Date.now() - t, value };
}

async function migrationState(): Promise<{
  applied: number;
  pending: string[];
  detail?: string;
}> {
  try {
    const onDisk = (
      await readdir(join(process.cwd(), "prisma", "migrations"), {
        withFileTypes: true,
      })
    )
      .filter((d) => d.isDirectory() && /^\d{14}_/.test(d.name))
      .map((d) => d.name)
      .sort();

    const rows = await prisma.$queryRawUnsafe<{ migration_name: string }[]>(
      `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`,
    );
    const appliedNames = new Set(rows.map((r) => r.migration_name));
    const pending = onDisk.filter((m) => !appliedNames.has(m));
    return { applied: appliedNames.size, pending };
  } catch (err) {
    return { applied: 0, pending: [], detail: (err as Error).message };
  }
}

async function ragTableState(): Promise<{ tableReady: boolean; chunks: number }> {
  try {
    const chunks = await prisma.ragChunk.count();
    return { tableReady: true, chunks };
  } catch {
    return { tableReady: false, chunks: 0 };
  }
}

export async function runStartupChecks(): Promise<StartupReport> {
  const [db, cache, llm, rag, storage, budget] = await Promise.all([
    timed(async () => {
      await prisma.$queryRaw`SELECT 1`;
      return migrationState();
    }).catch((err: Error) => ({ ms: 0, value: null, error: err.message })),
    timed(() => redis.ping()).catch((err: Error) => ({ ms: 0, error: err.message })),
    llmHealth(),
    ragTableState(),
    ensureStorageWritable(),
    budgetSnapshot().catch(() => null),
  ]);

  const dbOk = "value" in db && db.value !== null;
  const database = dbOk
    ? {
        ok: true,
        latencyMs: db.ms,
        appliedMigrations: (db.value as { applied: number }).applied,
        pendingMigrations: (db.value as { pending: string[] }).pending,
        ...((db.value as { detail?: string }).detail
          ? { detail: (db.value as { detail?: string }).detail }
          : {}),
      }
    : {
        ok: false,
        latencyMs: 0,
        appliedMigrations: 0,
        pendingMigrations: [],
        detail: (db as { error?: string }).error ?? "database unreachable",
      };

  const redisOk = !("error" in cache);
  const report: StartupReport = {
    ok: database.ok && redisOk,
    checkedAt: new Date().toISOString(),
    env: { ok: true, nodeEnv: env.NODE_ENV },
    database,
    redis: redisOk
      ? { ok: true, latencyMs: (cache as { ms: number }).ms }
      : { ok: false, latencyMs: 0, detail: (cache as { error: string }).error },
    llm: {
      ...llm,
      localInference:
        /^(localhost|127\.|0\.0\.0\.0|\[?::1\]?|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|host\.docker\.internal|.+\.local)/i.test(
          new URL(llm.baseUrl).hostname,
        ),
    },
    rag: { enabled: env.RAG_ENABLED && Boolean(env.LLM_EMBED_MODEL), ...rag },
    storage,
    budget,
  };

  if (database.pendingMigrations.length > 0) {
    logger.warn("startup: pending database migrations", {
      pending: database.pendingMigrations,
      fix: "npm run prisma:deploy",
    });
  }
  if (!report.llm.ok) {
    logger.warn("startup: local LLM unreachable", { detail: report.llm.detail });
  }
  logger.info("startup checks complete", {
    ok: report.ok,
    dbMs: database.latencyMs,
    llmOk: report.llm.ok,
    ragChunks: report.rag.chunks,
  });

  return report;
}

let bootPromise: Promise<StartupReport> | null = null;

/** Idempotent: runs the checks once per process, plus an optional spoken boot briefing. */
export function ensureBootChecked(): Promise<StartupReport> {
  if (!bootPromise) {
    bootPromise = runStartupChecks().then(async (report) => {
      if (env.JARVIS_BOOT_BRIEFING) {
        try {
          const { speakBootBriefing } = await import("@/lib/voice/briefing");
          await speakBootBriefing(report);
        } catch (err) {
          logger.warn("boot briefing skipped", { error: (err as Error).message });
        }
      }
      return report;
    });
  }
  return bootPromise;
}
