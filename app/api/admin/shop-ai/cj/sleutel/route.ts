import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { recordAudit } from "@/lib/audit";
import { cjStand, zetCjSleutel } from "@/lib/shop/cj/cj-client";
import { leesCjInstellingen, zetCjInstellingen } from "@/lib/shop/cj/importeer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// De CJ-koppeling (Beheer → Winkel-AI → Leverancier): staat er een sleutel, en de instellingen
// (verzendkosten per stuk, land van het magazijn, eigen marge). De sleutel zelf komt nooit terug.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  const [stand, instellingen] = await Promise.all([cjStand(), leesCjInstellingen()]);
  return NextResponse.json({ ...stand, instellingen });
});

const sleutelSchema = z.object({ sleutel: z.string().trim().min(20).max(400) });

// PUT: sleutel opslaan (eerst geprobeerd bij CJ; een foute sleutel wordt niet bewaard)
export const PUT = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const parsed = sleutelSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw AppError.validation("Plak de API-sleutel van CJ (My CJ → Authorization → API).");
  await zetCjSleutel(parsed.data.sleutel);
  await recordAudit({ category: "ADMIN", action: "shop.cj.sleutel", actorUserId: principal.userId, actorLabel: "user", summary: "CJ-sleutel ingesteld", targetType: "shop", targetId: "cj" });
  return NextResponse.json(await cjStand());
});

export const DELETE = withAdminAccess(["PLATFORM_ADMIN"], async (_request, { principal }) => {
  await zetCjSleutel(null);
  await recordAudit({ category: "ADMIN", action: "shop.cj.sleutel", actorUserId: principal.userId, actorLabel: "user", summary: "CJ-sleutel verwijderd", targetType: "shop", targetId: "cj" });
  return NextResponse.json(await cjStand());
});

const instellingenSchema = z.object({
  verzendCents: z.number().int().min(0).max(5000).optional(),
  land: z.string().trim().max(2).optional(),
  margePct: z.number().min(5).max(90).nullable().optional(),
});

// PATCH: instellingen
export const PATCH = withAdminAccess(["PLATFORM_ADMIN"], async (request) => {
  const parsed = instellingenSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw AppError.validation("Controleer de instellingen: verzendkosten in centen (0 tot 5000), land als twee letters, marge 5 tot 90.");
  const huidig = await leesCjInstellingen();
  const instellingen = await zetCjInstellingen({ ...huidig, ...parsed.data });
  return NextResponse.json({ instellingen });
});
