import { NextResponse } from "next/server";
import { z } from "zod";
import { toErrorBody } from "@/lib/errors";
import { employerTenant } from "@/lib/webhooks/employer";
import { enforceRateLimit } from "@/lib/rate-limit";
import { fillForecast } from "@/lib/pricing/advice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  title: z.string().trim().min(2).max(120),
  skill: z.string().max(80).optional(),
  startsAt: z.string().min(1),
  rateCents: z.coerce.number().int().min(0).max(100000),
  viaUitzend: z.boolean().optional(),
});

// POST /api/werkgever/pricing — vervullingskans + tarief-advies voor een concept-klus.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { principal } = await employerTenant(false);
    await enforceRateLimit({ name: "pricing-advice", identifier: principal.userId, limit: 120, windowSeconds: 3600 });
    const input = schema.parse(await request.json().catch(() => ({})));
    return NextResponse.json(await fillForecast(input));
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
