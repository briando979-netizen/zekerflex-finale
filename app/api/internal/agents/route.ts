import { NextResponse } from "next/server";
import { z } from "zod";
import { runAgents } from "@/lib/agents/orchestrator";
import { env } from "@/lib/env";
import type { AgentId } from "@/lib/agents/types";

// POST /api/internal/agents
// Runs one or more autonomous agents and returns their reports.
// Protected by CRON_SECRET or INTERNAL_CRON_TOKEN header.

function isAuthorised(req: Request): boolean {
  const secret = req.headers.get("x-cron-secret") ?? req.headers.get("authorization")?.replace("Bearer ", "");
  const allowed = env.CRON_SECRET ?? env.INTERNAL_CRON_TOKEN;
  return Boolean(allowed && secret === allowed);
}

const bodySchema = z.object({
  agents: z
    .array(z.enum(["sales", "recruiter", "compliance", "finance", "quality", "klantenservice"]))
    .optional()
    .default(["sales", "recruiter", "compliance", "finance"]),
});

export async function POST(req: Request) {
  if (!isAuthorised(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  const reports = await runAgents(body.data.agents as AgentId[]);
  const totalActions = reports.reduce((s, r) => s + r.actionsProposed.length, 0);
  const totalErrors = reports.reduce((s, r) => s + r.errors.length, 0);

  return NextResponse.json({ reports, totalActions, totalErrors });
}
