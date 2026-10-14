import { NextResponse } from "next/server";
import { z } from "zod";
import { forecastDemand } from "@/lib/forecasting/demand";
import { env } from "@/lib/env";

// POST /api/internal/forecast — demand forecast for a tenant/branch.

function isAuthorised(req: Request): boolean {
  const secret = req.headers.get("x-cron-secret") ?? req.headers.get("authorization")?.replace("Bearer ", "");
  const allowed = env.CRON_SECRET ?? env.INTERNAL_CRON_TOKEN;
  return Boolean(allowed && secret === allowed);
}

const bodySchema = z.object({
  tenantId: z.string(),
  branchId: z.string().optional(),
  fromDate: z.string().datetime().optional(),
  days: z.number().int().min(1).max(90).default(14),
});

export async function POST(req: Request) {
  if (!isAuthorised(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  const fromDate = body.data.fromDate ? new Date(body.data.fromDate) : new Date();
  const result = await forecastDemand({
    tenantId: body.data.tenantId,
    branchId: body.data.branchId,
    fromDate,
    days: body.data.days,
  });

  return NextResponse.json(result);
}
