import { PrismaClient } from "@prisma/client";
import { env } from "@/lib/env";
import { meetQuery, queryTabel, trageQueryNiveau } from "@/lib/ops/apm";
import { metrics } from "@/lib/metrics/registry";
import { logger } from "@/lib/logger";

/**
 * Singleton Prisma client. Next.js dev mode re-evaluates modules on every
 * change, so we cache the instance on `globalThis` to avoid exhausting the
 * database connection pool.
 */
// schema.prisma's directUrl reads DATABASE_URL_UNPOOLED; if the host stops
// providing it (Neon integration change), fall back instead of failing.
if (!process.env.DATABASE_URL_UNPOOLED && process.env.DATABASE_URL) {
  // Neon's direct host is the pooled host without "-pooler".
  process.env.DATABASE_URL_UNPOOLED = process.env.DATABASE_URL.replace("-pooler.", ".");
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function maakClient() {
  // Query-events (duur + kale SQL, zonder parameters) voeden de prestatiemeting
  // (lib/ops/apm.ts, Admin → Prestaties): trage query's komen in het foutenlogboek.
  const client = new PrismaClient({
    log: [
      { emit: "event", level: "query" },
      { emit: "stdout", level: "error" },
      ...(env.NODE_ENV === "development" ? [{ emit: "stdout", level: "warn" } as const] : []),
    ],
  });
  client.$on("query", (e) => {
    try {
      metrics().dbQueryDuration.observe(e.duration / 1000);
      // een bekende trage query (lib/ops/apm.ts) onder de drempel alleen als info, buiten het foutenlogboek
      if (meetQuery(e.duration, e.query, env.APM_SLOW_QUERY_MS)) {
        // de tabel als reden: elke tabel krijgt zo een eigen groep (en eigen voorbeelden) in het foutenlogboek
        const tabel = queryTabel(e.query);
        logger[trageQueryNiveau(e.duration, e.query)]("trage databasequery", { ms: e.duration, query: e.query.slice(0, 160), ...(tabel ? { reason: tabel } : {}) });
      }
    } catch {
      // meten mag een query nooit in de weg zitten
    }
  });
  return client;
}

export const prisma = globalForPrisma.prisma ?? maakClient();

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
