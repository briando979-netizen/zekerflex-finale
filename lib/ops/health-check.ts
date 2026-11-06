import { kvSet, kvGet } from "@/lib/storage/kv";
import { prisma } from "@/lib/prisma";

export interface HealthCheck {
  status: "healthy" | "degraded" | "critical";
  checks: { name: string; ok: boolean; ms: number }[];
  at: string;
}

export async function runHealthCheck(): Promise<HealthCheck> {
  const checks = [];
  const t0 = Date.now();

  // DB check
  try {
    await prisma.user.count();
    checks.push({ name: "Database", ok: true, ms: Date.now() - t0 });
  } catch {
    checks.push({ name: "Database", ok: false, ms: Date.now() - t0 });
  }

  // KV check
  try {
    await kvGet("test");
    checks.push({ name: "KV Store", ok: true, ms: Date.now() - t0 });
  } catch {
    checks.push({ name: "KV Store", ok: false, ms: Date.now() - t0 });
  }

  const ok = checks.every((c) => c.ok);
  const status = ok ? "healthy" : "degraded";
  const result: HealthCheck = { status, checks, at: new Date().toISOString() };

  await kvSet("health:latest", result).catch(() => {});
  return result;
}
