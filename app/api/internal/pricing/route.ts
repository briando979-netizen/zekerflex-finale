import { NextResponse } from "next/server";
import { z } from "zod";
import { computeDynamicPricing } from "@/lib/pricing/dynamic";
import { env } from "@/lib/env";

// POST /api/internal/pricing — dynamic pricing signals for a shift.

function isAuthorised(req: Request): boolean {
  const secret = req.headers.get("x-cron-secret") ?? req.headers.get("authorization")?.replace("Bearer ", "");
  const allowed = env.CRON_SECRET ?? env.INTERNAL_CRON_TOKEN;
  return Boolean(allowed && secret === allowed);
}

const bodySchema = z.object({
  shiftId: z.string(),
  requiredSkillIds: z.array(z.string()).default([]),
  requiredCertIds: z.array(z.string()).default([]),
  startsAt: z.string().datetime(),
  locationLat: z.number().optional(),
  locationLng: z.number().optional(),
});

export async function POST(req: Request) {
  if (!isAuthorised(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  const { startsAt, ...rest } = body.data;
  const result = await computeDynamicPricing({ ...rest, startsAt: new Date(startsAt) });

  return NextResponse.json(result);
}
