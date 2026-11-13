import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { recordAudit } from "@/lib/audit";
import { TAB_NAAM, standaardTabVolgorde } from "@/lib/werker/tab-volgorde";
import { getTabVolgorde, resetTabVolgorde, setTabVolgorde } from "@/lib/werker/tab-volgorde-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// De volgorde van de balk onderaan de werker-app (Site-ontwerper, tabblad Menu): geldt voor alle werkers.

async function antwoord() {
  const eigen = await getTabVolgorde();
  return { volgorde: eigen ?? standaardTabVolgorde(), eigen: Boolean(eigen), namen: TAB_NAAM };
}

// GET: de volgorde zoals die live staat.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => NextResponse.json(await antwoord()));

const schema = z.object({ volgorde: z.array(z.string().max(40)).max(20) });

// PUT: een eigen volgorde live zetten. Gelijk aan de standaard = de eigen versie weg.
export const PUT = withAdminAccess(["PLATFORM_ADMIN"], async (request: Request, { principal }) => {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw AppError.validation("Deze volgorde kon niet worden gelezen.");
  const eigen = await setTabVolgorde(parsed.data.volgorde);
  await recordAudit({
    category: "ADMIN",
    action: "ontwerp.werker-tabs",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: eigen ? "Volgorde van de balk van de werker-app bijgewerkt" : "Volgorde van de balk van de werker-app is weer de standaard",
  });
  return NextResponse.json(await antwoord());
});

// DELETE: terug naar de standaard.
export const DELETE = withAdminAccess(["PLATFORM_ADMIN"], async (_request: Request, { principal }) => {
  await resetTabVolgorde();
  await recordAudit({ category: "ADMIN", action: "ontwerp.werker-tabs", actorUserId: principal.userId, actorLabel: "user", summary: "Volgorde van de balk van de werker-app terug naar de standaard" });
  return NextResponse.json(await antwoord());
});
