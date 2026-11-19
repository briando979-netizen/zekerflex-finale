import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { stuurLogoVrijgave, stuurVrijgave } from "@/lib/advertentie/melding";
import { KEUZE_GEWIJZIGD } from "@/lib/advertentie/regels";
import { bewaarPrijzen, geefVrij, leesIngesteldePrijzen, verwijderAdvertentie } from "@/lib/advertentie/store";
import { geefLogoVrij, verwijderLogo } from "@/lib/logo/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const id = z.string().regex(/^[a-f0-9]{32}$/);
const soort = z.enum(["advertentie", "logo"]).default("advertentie");
const prijs = z.string().max(40);
const schema = z.discriminatedUnion("actie", [
  // gezienOp: het tijdstip van de aanvraag die de beheerder op zijn scherm had
  z.object({ actie: z.literal("vrijgeven"), id, soort, gezienOp: z.string().min(10).max(40) }),
  z.object({ actie: z.literal("prijs"), een: prijs, alle: prijs, logo: prijs }),
]);

async function lees(request: Request): Promise<unknown> {
  return request.json().catch(() => {
    throw AppError.validation("Body moet JSON zijn");
  });
}

/** De klant koos intussen iets anders: niets vrijgegeven, 409 met een eigen code en de versie van nu voor het scherm. */
const gewijzigd = (rij: unknown) => NextResponse.json({ error: { code: KEUZE_GEWIJZIGD.code, message: KEUZE_GEWIJZIGD.tekst }, rij }, { status: 409 });

// PATCH /api/admin/advertentie-op-maat: een platformbeheerder geeft een advertentie of een logo vrij (na betaling; de
// klant krijgt de link naar de schone bestanden per mail) of stelt de prijzen in (alleen een bedrag, anders 422; leeg =
// de standaard uit lib/advertentie/regels.ts). Vrijgeven geldt voor de aanvraag die de beheerder zag (gezienOp): wijzigde
// de klant zijn keuze na het betaalverzoek, dan 409 KEUZE_GEWIJZIGD en gebeurt er niets. Het antwoord is de serverversie.
export const PATCH = withAdminAccess(["PLATFORM_ADMIN"], async (request) => {
  const d = schema.parse(await lees(request));
  if (d.actie === "prijs") {
    const prijzen = await bewaarPrijzen({ een: d.een, alle: d.alle, logo: d.logo });
    return NextResponse.json({ ok: true, prijzen, ingesteld: await leesIngesteldePrijzen() });
  }
  if (d.soort === "logo") {
    const uit = await geefLogoVrij(d.id, d.gezienOp);
    if (!uit.ok) return gewijzigd(uit.rij);
    return NextResponse.json({ ok: true, rij: uit.rij, gemaild: await stuurLogoVrijgave(uit.rij) });
  }
  const uit = await geefVrij(d.id, d.gezienOp);
  if (!uit.ok) return gewijzigd(uit.rij);
  return NextResponse.json({ ok: true, rij: uit.rij, gemaild: await stuurVrijgave(uit.rij) });
});

// DELETE /api/admin/advertentie-op-maat: een advertentie of logo (met de gegevens van de aanvrager) definitief wissen.
export const DELETE = withAdminAccess(["PLATFORM_ADMIN"], async (request) => {
  const d = z.object({ id, soort }).parse(await lees(request));
  if (d.soort === "logo") await verwijderLogo(d.id);
  else await verwijderAdvertentie(d.id);
  return NextResponse.json({ ok: true });
});
