import { NextResponse } from "next/server";
import { z } from "zod";
import { getPrincipal } from "@/lib/auth";
import { recordVisitEvent, sourceOf, type Role } from "@/lib/analytics/live";
import { fixedWindow } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/analytics/ping — attention signals from AnalyticsBeacon: page view,
// visible-time heartbeats, tab switched away/back, page left, nudge shown/clicked.
// Anonymous and cookie-free (see lib/analytics/live.ts). Sent with sendBeacon,
// so the body may arrive as text/plain.
const schema = z.object({
  id: z.string().min(6).max(64),
  e: z.enum(["view", "beat", "hide", "show", "leave", "nudge-shown", "nudge-click"]),
  p: z.string().min(1).max(300),
  ms: z.number().min(0).max(600_000).optional(),
  w: z.number().min(0).max(10_000).optional(),
  r: z.string().max(400).optional(),
  n: z.string().max(40).optional(),
});

const BOT = /bot|crawl|spider|slurp|headless|lighthouse|preview|monitor/i;

function roleOf(roles: string[]): Role | null {
  if (roles.some((r) => r === "PLATFORM_ADMIN" || r === "SALES")) return null; // own team: not counted
  if (roles.includes("FREELANCER")) return "freelancer";
  if (roles.length) return "bedrijf";
  return "anoniem";
}

export async function POST(request: Request): Promise<NextResponse> {
  const ua = request.headers.get("user-agent") ?? "";
  if (BOT.test(ua)) return NextResponse.json({ ok: true });
  const parsed = schema.safeParse(JSON.parse((await request.text().catch(() => "")) || "null"));
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
  const b = parsed.data;
  if (b.p.startsWith("/admin") || b.p.startsWith("/api")) return NextResponse.json({ ok: true });
  const gate = await fixedWindow(`analytics:ping:${Math.floor(Date.now() / 60_000)}:${b.id}`, 30, 90);
  if (!gate.ok) return NextResponse.json({ ok: true });

  try {
    // Only a page view needs to know who's looking; heartbeats reuse the stored role.
    let role: Role = "anoniem";
    if (b.e === "view") {
      const principal = await getPrincipal().catch(() => null);
      const r = principal ? roleOf(principal.memberships.map((m) => m.role)) : "anoniem";
      if (r === null) return NextResponse.json({ ok: true });
      role = r;
    }
    const width = b.w ?? 1200;
    await recordVisitEvent({
      id: b.id,
      event: b.e,
      path: b.p,
      ...(b.ms !== undefined ? { ms: b.ms } : {}),
      device: width < 640 ? "mobiel" : width < 1024 ? "tablet" : "desktop",
      role,
      source: sourceOf(b.r, new URL(request.url).hostname),
      ...(b.n ? { nudge: b.n } : {}),
    });
  } catch {
    /* analytics must never break anything */
  }
  return NextResponse.json({ ok: true });
}
