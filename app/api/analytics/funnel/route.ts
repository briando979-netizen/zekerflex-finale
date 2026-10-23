import { NextResponse } from "next/server";
import { z } from "zod";
import { fixedWindow } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { recordFunnel } from "@/lib/analytics/funnel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ funnel: z.string().max(60), step: z.string().max(60), sessionId: z.string().max(64).optional() });

// POST /api/analytics/funnel — anonieme funnel-stap (soeverein, cookievrij, rate-limited).
export async function POST(request: Request): Promise<NextResponse> {
  const gate = await fixedWindow(`rl:funnel:${clientIp(request)}`, 120, 600);
  if (!gate.ok) return NextResponse.json({ ok: false }, { status: 429 });
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
  await recordFunnel(parsed.data.funnel, parsed.data.step);
  return NextResponse.json({ ok: true });
}
