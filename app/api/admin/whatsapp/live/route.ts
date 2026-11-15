import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { liveGesprekken, liveStand, liveUitloggen } from "@/lib/whatsapp/brug";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin → WhatsApp, live (15 nov 2026): de stand van de koppeling, de koppelcode zolang er niet gekoppeld is, en
// daarna de gesprekken. POST { actie: "uitloggen" } ontkoppelt. Alleen PLATFORM_ADMIN.

export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  const stand = await liveStand();
  const gesprekken = stand.verbonden ? await liveGesprekken().catch(() => []) : [];
  return NextResponse.json({ stand, gesprekken }, { headers: { "Cache-Control": "no-store" } });
});

const actie = z.object({ actie: z.literal("uitloggen") });

export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const parsed = actie.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) throw AppError.validation("Onbekende actie.");
  await liveUitloggen();
  await recordAudit({
    category: "ADMIN",
    action: "admin.whatsapp.ontkoppeld",
    severity: "warning",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `${principal.email} ontkoppelde de WhatsApp-koppeling`,
  });
  return NextResponse.json({ ok: true });
});
