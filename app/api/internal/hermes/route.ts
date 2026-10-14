import { NextResponse } from "next/server";
import { z } from "zod";
import { runHermes } from "@/lib/agents/hermes";
import { env } from "@/lib/env";

// POST /api/internal/hermes
// Fast reasoning agent — accepts a task, returns structured reasoning + actions.

function isAuthorised(req: Request): boolean {
  const secret = req.headers.get("x-cron-secret") ?? req.headers.get("authorization")?.replace("Bearer ", "");
  const allowed = env.CRON_SECRET ?? env.INTERNAL_CRON_TOKEN;
  return Boolean(allowed && secret === allowed);
}

const bodySchema = z.object({
  task: z.string().min(1).max(2000),
  context: z.string().max(4000).optional(),
  maxActions: z.number().int().min(1).max(10).default(3),
});

export async function POST(req: Request) {
  if (!isAuthorised(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  const result = await runHermes(body.data);
  return NextResponse.json(result);
}
