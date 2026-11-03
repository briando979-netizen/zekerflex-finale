import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { bouwer, voorbeeldLink, type VoorbeeldStand } from "@/lib/bouwer/werker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Live voorbeeld van de werkkopie van de Bouwer: next dev met alleen demogegevens.
// GET = stand (+ een getekende link van 2 uur als hij aan staat); POST = start/stop.

export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  const stand = await bouwer<VoorbeeldStand>("/voorbeeld");
  return NextResponse.json({ ...stand, link: stand.staat === "aan" ? voorbeeldLink() : null });
});

const schema = z.object({ actie: z.enum(["start", "stop"]) });

export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) throw AppError.validation("Onbekende actie");
  const stand = await bouwer<VoorbeeldStand>(`/voorbeeld/${parsed.data.actie}`, { method: "POST", body: {} });
  if (parsed.data.actie === "start") {
    await recordAudit({
      category: "ADMIN",
      action: "admin.bouwer.voorbeeld",
      severity: "info",
      actorUserId: principal.userId,
      actorLabel: "user",
      summary: `${principal.email} startte het live voorbeeld van de Bouwer`,
    });
  }
  return NextResponse.json({ ...stand, link: stand.staat === "aan" ? voorbeeldLink() : null });
});
