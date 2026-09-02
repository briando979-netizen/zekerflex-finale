import { PrismaClient } from "@prisma/client";
import { env } from "@/lib/env";

/**
 * Singleton Prisma client. Next.js dev mode re-evaluates modules on every
 * change, so we cache the instance on `globalThis` to avoid exhausting the
 * database connection pool.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
