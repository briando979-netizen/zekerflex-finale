import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { stuurLogoVrijgave, stuurVrijgave } from "@/lib/advertentie/melding";
import { PRIJS_MAX } from "@/lib/advertentie/regels";
import { bewaarPrijzen, geefVrij, leesIngesteldePrijzen, verwijderAdvertentie } from "@/lib/advertentie/store";
import { geefLogoVrij, verwijderLogo } from "@/lib/logo/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const id = z.string().regex(/^[a-f0-9]{32}$/);
const soort = z.enum(["advertentie", "logo"]).default("advertentie");
const prijs = z.string().max(PRIJS_MAX * 2);
const schema = z.discriminatedUnion("actie", [z.object({ actie: z.literal("vrijgeven"), id, soort }), z.object({ actie: z.literal("prijs"), een: prijs, alle: prijs, logo: prijs })]);

async function lees(request: Request): Promise<unknown> {
  return request.json().catch(() => {
    throw AppError.validation("Body moet JSON zijn");
  });
}

// PATCH /api/admin/advertentie-op-maat: een platformbeheerder geeft een advertentie of een logo vrij (na betaling; de
// klant krijgt de link naar de schone bestanden per mail) of stelt de prijzen in (leeg = de standaard uit
// lib/advertentie/regels.ts). Het antwoord is de serverversie, die het scherm overneemt.
export const PATCH = withAdminAccess(["PLATFORM_ADMIN"], async (request) => {
  const d = schema.parse(await lees(request));
  if (d.actie === "prijs") {
    const prijzen = await bewaarPrijzen({ een: d.een, alle: d.alle, logo: d.logo });
    return NextResponse.json({ ok: true, prijzen, ingesteld: await leesIngesteldePrijzen() });
  }
  if (d.soort === "logo") {
    const logo = await geefLogoVrij(d.id);
    return NextResponse.json({ ok: true, logo, gemaild: await stuurLogoVrijgave(logo) });
  }
  const advertentie = await geefVrij(d.id);
  return NextResponse.json({ ok: true, advertentie, gemaild: await stuurVrijgave(advertentie) });
});

// DELETE /api/admin/advertentie-op-maat: een advertentie of logo (met de gegevens van de aanvrager) definitief wissen.
export const DELETE = withAdminAccess(["PLATFORM_ADMIN"], async (request) => {
  const d = z.object({ id, soort }).parse(await lees(request));
  if (d.soort === "logo") await verwijderLogo(d.id);
  else await verwijderAdvertentie(d.id);
  return NextResponse.json({ ok: true });
});
