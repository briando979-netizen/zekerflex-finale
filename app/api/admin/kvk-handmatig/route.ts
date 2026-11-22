import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { draaiKvkHandmatigTerug, keurKvkHandmatigGoed } from "@/lib/kvk/handmatig-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Of de inhoud klopt (8 cijfers, een naam, een reden van minimaal 5 tekens) controleren de hulpjes in lib/kvk/handmatig.ts,
// met een melding in gewoon Nederlands; hier alleen de vorm.
const schema = z.object({
  actie: z.enum(["goedkeuren", "terugdraaien"]),
  soort: z.enum(["werker", "bedrijf"]),
  /** userId bij een werker, tenantId bij een bedrijf */
  id: z.string().trim().min(1).max(64),
  kvkNumber: z.string().max(40).optional(),
  naam: z.string().max(400).optional(),
  notitie: z.string().max(2000).optional(),
  bevestigd: z.boolean().optional(),
  reden: z.string().max(2000).optional(),
});

// POST /api/admin/kvk-handmatig — een KVK-controle met de hand goedkeuren of terugdraaien (22 nov 2026): voor een bedrijf en
// voor een werker die op de controle wacht. Zonder KVKBase of de open dataset aan te roepen; de beheerder, de datum, het
// nummer en de reden worden vastgelegd en komen in het auditspoor (kvk.handmatig_goedgekeurd / kvk.handmatig_teruggedraaid).
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const body = schema.parse(await request.json().catch(() => ({})));
  if (body.actie === "goedkeuren") {
    const handmatig = await keurKvkHandmatigGoed({
      principal,
      soort: body.soort,
      id: body.id,
      kvkNumber: body.kvkNumber,
      naam: body.naam,
      notitie: body.notitie,
      bevestigd: body.bevestigd,
    });
    return NextResponse.json({ ok: true, actie: body.actie, handmatig });
  }
  const { handmatig, geldigheidBlijft } = await draaiKvkHandmatigTerug({ principal, soort: body.soort, id: body.id, reden: body.reden });
  return NextResponse.json({ ok: true, actie: body.actie, handmatig, geldigheidBlijft });
});
