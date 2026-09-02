import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Kubernetes readiness probe: 200 only when the app can actually serve traffic
// (database + cache reachable). Distinct from /api/health, which is liveness and
// never touches a backing service. Never mutates anything.
export async function GET(): Promise<NextResponse> {
  const checks: Record<string, "up" | "down"> = { database: "down", cache: "down" };

  await Promise.all([
    prisma
      .$queryRaw`SELECT 1`
      .then(() => {
        checks.database = "up";
      })
      .catch(() => undefined),
    redis
      .ping()
      .then(() => {
        checks.cache = "up";
      })
      .catch(() => undefined),
  ]);

  const ready = Object.values(checks).every((v) => v === "up");
  return NextResponse.json(
    { ready, checks, ts: Date.now() },
    { status: ready ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}

export async function HEAD(): Promise<Response> {
  const res = await GET();
  return new Response(null, { status: res.status });
}
