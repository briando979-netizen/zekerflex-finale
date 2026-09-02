import { NextResponse } from "next/server";
import { z } from "zod";
import { AnalyticsEventType } from "@prisma/client";
import { getPrincipal } from "@/lib/auth";
import { trackEvents } from "@/lib/analytics/track";

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

export async function POST(request: Request): Promise<NextResponse> {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
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
