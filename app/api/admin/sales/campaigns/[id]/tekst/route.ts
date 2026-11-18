import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { withAdminAccess } from "@/lib/auth/handlers";
import { getCampaign } from "@/lib/sales/campaign";
import { beoordeelCampagneTekst } from "@/lib/sales/campagne-tekst";
import { bewaarCampagneTekst, leesCampagneTekst, wisCampagneTekst } from "@/lib/sales/campagne-tekst-opslag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Beheer → Sales → campagne → paneel "De mail" (components/admin/sales/CampagneMailFormulier.tsx).
// GET: de vaste tekst van de campagne (of null). PUT: bewaren, na de controle van lib/sales/campagne-tekst.ts
// (422 met de redenen als hij niet mag). DELETE: weghalen; de campagne schrijft dan weer per bedrijf een mail.

const paramsSchema = z.object({ id: z.string().min(1).max(128) });

// ruime grenzen: de echte regels (lengte, woorden, bedragen) geeft beoordeelCampagneTekst, met een zin per fout
const Invoer = z.object({
  onderwerp: z.string().max(400),
  tekst: z.string().max(10_000),
  knopTekst: z.string().max(200).optional(),
  knopUrl: z.string().max(500).optional(),
  zonderVacature: z.boolean().optional(),
});

export const GET = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (_req, { params }) => {
  const { id } = paramsSchema.parse(params);
  await getCampaign(id);
  return NextResponse.json({ tekst: await leesCampagneTekst(id) });
});

export const PUT = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (request, { params, principal }) => {
  const { id } = paramsSchema.parse(params);
  const campaign = await getCampaign(id);
  const invoer = Invoer.safeParse(await request.json().catch(() => null));
  if (!invoer.success) throw AppError.validation("Het verzoek kwam niet goed aan. Vernieuw de pagina en probeer het opnieuw.");

  const { onderwerp, tekst, knopTekst, knopUrl } = invoer.data;
  const kandidaat = {
    onderwerp,
    tekst,
    ...(knopTekst?.trim() ? { knopTekst: knopTekst.trim() } : {}),
    ...(knopUrl?.trim() ? { knopUrl: knopUrl.trim() } : {}),
    zonderVacature: invoer.data.zonderVacature === true,
  };
  const oordeel = beoordeelCampagneTekst(kandidaat);
  if (!oordeel.goed) {
    return NextResponse.json(
      { error: { code: "VALIDATION_FAILED", message: "De tekst kan zo niet bewaard worden.", redenen: oordeel.redenen } },
      { status: 422 },
    );
  }

  const bewaard = await bewaarCampagneTekst(id, kandidaat, principal.email);
  await recordAudit({
    category: "SALES",
    action: "sales.campaign.tekst-bewaard",
    actorUserId: principal.userId,
    summary: `Vaste mailtekst bewaard voor campagne "${campaign.name}"${bewaard.zonderVacature ? " (ook bedrijven zonder vacature)" : ""}`,
    targetType: "salesCampaign",
    targetId: id,
  });
  return NextResponse.json({ tekst: bewaard });
});

export const DELETE = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (_req, { params, principal }) => {
  const { id } = paramsSchema.parse(params);
  const campaign = await getCampaign(id);
  await wisCampagneTekst(id);
  await recordAudit({
    category: "SALES",
    action: "sales.campaign.tekst-gewist",
    actorUserId: principal.userId,
    summary: `Vaste mailtekst weggehaald bij campagne "${campaign.name}"`,
    targetType: "salesCampaign",
    targetId: id,
  });
  return NextResponse.json({ ok: true });
});
