import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { env } from "@/lib/env";
import { pushChannels } from "@/lib/notifications/push";

/** Is the local inference server reachable at all (not: is a model warm). */
async function llmReachable(): Promise<boolean> {
  try {
    const base = env.LLM_BASE_URL.replace(/\/+$/, "");
    const res = await fetch(`${base}/models`, {
      signal: AbortSignal.timeout(3000),
      ...(env.LLM_API_KEY ? { headers: { Authorization: `Bearer ${env.LLM_API_KEY}` } } : {}),
    });
    return res.ok || res.status === 404; // 404 = server up, route differs
  } catch {
    return false;
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public, sanitised system status. No error details, no internal hostnames —
// just component health so visitors (and the /status page) can see uptime.

type State = "operational" | "degraded" | "down";

async function probe(fn: () => Promise<unknown>): Promise<{ state: State; latencyMs: number }> {
  const started = Date.now();
  try {
    await fn();
    const latencyMs = Date.now() - started;
    return { state: latencyMs > 1500 ? "degraded" : "operational", latencyMs };
  } catch {
    return { state: "down", latencyMs: Date.now() - started };
  }
}

export async function GET(): Promise<NextResponse> {
  const [database, cache, llmUp] = await Promise.all([
    probe(() => prisma.$queryRaw`SELECT 1`),
    probe(() => redis.ping()),
    llmReachable(),
  ]);

  const channels = pushChannels();

  const components = [
    { key: "web", label: "Website & app", ...operationalIf(true) },
    { key: "database", label: "Database", ...database },
    { key: "cache", label: "Realtime & wachtrijen", ...cache },
    {
      key: "payments",
      label: "Uitbetalingen (SEPA)",
      ...operationalIf(database.state !== "down"),
    },
    { key: "assistant", label: "AI-assistent", ...operationalIf(llmUp) },
    {
      key: "notifications",
      label: "Meldingen (push)",
      ...operationalIf(channels.webPush || channels.fcm),
    },
  ];

  const worst = components.reduce<State>((acc, c) => rank(c.state) > rank(acc) ? c.state : acc, "operational");

  return NextResponse.json(
    {
      checkedAt: new Date().toISOString(),
      overall: worst,
      components,
    },
    { headers: { "cache-control": "no-store" } },
  );
}

function operationalIf(ok: boolean): { state: State; latencyMs: number } {
  return { state: ok ? "operational" : "degraded", latencyMs: 0 };
}
function rank(s: State): number {
  return s === "down" ? 2 : s === "degraded" ? 1 : 0;
}
