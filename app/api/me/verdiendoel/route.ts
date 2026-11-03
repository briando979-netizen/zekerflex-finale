import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { getEarningsGoal, setEarningsGoal } from "@/lib/dashboard/earnings-goal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/me/verdiendoel — my monthly earnings goal (gross cents) or null.
export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    return NextResponse.json({ monthlyCents: await getEarningsGoal(p.userId) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

const schema = z.object({ monthlyCents: z.number().int().nullable() });

// POST { monthlyCents } — set the goal, or null to remove it.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const { monthlyCents } = schema.parse(await request.json().catch(() => ({})));
    return NextResponse.json({ monthlyCents: await setEarningsGoal(p.userId, monthlyCents) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
