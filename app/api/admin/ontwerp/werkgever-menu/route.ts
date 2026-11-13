import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { recordAudit } from "@/lib/audit";
import { MENU_NAAM, standaardMenuVolgorde } from "@/lib/werkgever/menu-volgorde";
import { getMenuVolgorde, resetMenuVolgorde, setMenuVolgorde } from "@/lib/werkgever/menu-volgorde-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// De volgorde van het werkgeversmenu (Site-ontwerper, tabblad Menu): geldt voor het dashboard personeel van alle werkgevers.

async function antwoord() {
  const eigen = await getMenuVolgorde();
  return { volgorde: eigen ?? standaardMenuVolgorde(), eigen: Boolean(eigen), namen: MENU_NAAM };
}

// GET: de volgorde zoals die live staat.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => NextResponse.json(await antwoord()));

const lijst = z.array(z.string().max(40)).max(60);
const schema = z.object({ hoofd: lijst, beheer: lijst });

// PUT: een eigen volgorde live zetten. Gelijk aan de standaard = de eigen versie weg.
export const PUT = withAdminAccess(["PLATFORM_ADMIN"], async (request: Request, { principal }) => {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw AppError.validation("Deze volgorde kon niet worden gelezen.");
  const eigen = await setMenuVolgorde(parsed.data);
  await recordAudit({
    category: "ADMIN",
    action: "ontwerp.werkgever-menu",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: eigen ? "Volgorde van het werkgeversmenu bijgewerkt" : "Volgorde van het werkgeversmenu is weer de standaard",
  });
  return NextResponse.json(await antwoord());
});

// DELETE: terug naar de standaard.
export const DELETE = withAdminAccess(["PLATFORM_ADMIN"], async (_request: Request, { principal }) => {
  await resetMenuVolgorde();
  await recordAudit({ category: "ADMIN", action: "ontwerp.werkgever-menu", actorUserId: principal.userId, actorLabel: "user", summary: "Volgorde van het werkgeversmenu terug naar de standaard" });
  return NextResponse.json(await antwoord());
});
