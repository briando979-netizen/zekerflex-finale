import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { stuurVrijgave } from "@/lib/advertentie/melding";
import { PRIJS_MAX } from "@/lib/advertentie/regels";
import { bewaarPrijzen, geefVrij, leesIngesteldePrijzen, verwijderAdvertentie } from "@/lib/advertentie/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const id = z.string().regex(/^[a-f0-9]{32}$/);
const schema = z.discriminatedUnion("actie", [
  z.object({ actie: z.literal("vrijgeven"), id }),
  z.object({ actie: z.literal("prijs"), een: z.string().max(PRIJS_MAX * 2), alle: z.string().max(PRIJS_MAX * 2) }),
]);

async function lees(request: Request): Promise<unknown> {
  return request.json().catch(() => {
    throw AppError.validation("Body moet JSON zijn");
  });
}

// PATCH /api/admin/advertentie-op-maat: een platformbeheerder geeft een advertentie vrij (na betaling; de klant krijgt
// de link naar de schone bestanden per mail) of stelt de prijzen in (leeg = de standaard uit lib/advertentie/regels.ts).
// Het antwoord is de serverversie, die het scherm overneemt.
export const PATCH = withAdminAccess(["PLATFORM_ADMIN"], async (request) => {
  const d = schema.parse(await lees(request));
  if (d.actie === "prijs") {
    const prijzen = await bewaarPrijzen({ een: d.een, alle: d.alle });
    return NextResponse.json({ ok: true, prijzen, ingesteld: await leesIngesteldePrijzen() });
  }
  const advertentie = await geefVrij(d.id);
  const gemaild = await stuurVrijgave(advertentie);
  return NextResponse.json({ ok: true, advertentie, gemaild });
});

// DELETE /api/admin/advertentie-op-maat: een advertentie (met de gegevens van de aanvrager) definitief wissen.
export const DELETE = withAdminAccess(["PLATFORM_ADMIN"], async (request) => {
  const d = z.object({ id }).parse(await lees(request));
  await verwijderAdvertentie(d.id);
  return NextResponse.json({ ok: true });
});
