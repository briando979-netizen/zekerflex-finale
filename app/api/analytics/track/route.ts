import { withUsage } from "@/lib/ops/usage";
import { NextResponse } from "next/server";
import { z } from "zod";
import { AnalyticsEventType } from "@prisma/client";
import { getPrincipal } from "@/lib/auth";
import { trackEvents } from "@/lib/analytics/track";
import { fixedWindow } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { jsonBegrensd } from "@/lib/http/body-grens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/analytics/track  - sovereign, cookie-free page/interaction tracking.
// Public (visitors aren't logged in); rate-limited per session id.
const eventSchema = z.object({
  type: z.nativeEnum(AnalyticsEventType),
  path: z.string().min(1).max(512),
  label: z.string().max(200).optional(),
  referrer: z.string().max(512).optional(),
  meta: z.record(z.unknown()).optional(),
});

const bodySchema = z.object({
  sessionId: z.string().min(6).max(64),
  events: z.array(eventSchema).min(1).max(20),
});

async function handlePOST(request: Request): Promise<NextResponse> {
  // per IP vóór het lezen (12 nov): de limiet in trackEvents staat op een sessionId dat de browser zelf kiest
  const perIp = await fixedWindow(`analytics:track:ip:${Math.floor(Date.now() / 60_000)}:${clientIp(request)}`, 600, 90);
  if (!perIp.ok) return NextResponse.json({ ok: true, accepted: 0 });
  // hooguit 20 gebeurtenissen van een paar honderd tekens
  const gelezen = await jsonBegrensd(request, 64_000).catch(() => ({ ok: false as const }));
  const parsed = bodySchema.safeParse(gelezen.ok ? gelezen.waarde : null);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, accepted: 0 }, { status: 400 });
  }

  const principal = await getPrincipal().catch(() => null);
  const result = await trackEvents(parsed.data.events, {
    sessionId: parsed.data.sessionId,
    userId: principal?.userId ?? null,
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ ok: true, accepted: result.accepted });
}

export const POST = withUsage("analytics-track", handlePOST);
