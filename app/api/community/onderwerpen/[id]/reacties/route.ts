import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { controleerReactie, idUitPad, schoneTekst } from "@/lib/community/regels";
import { maakReactie } from "@/lib/community/store";
import { magSchrijven } from "@/lib/community/toegang";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  tekst: z.string().max(8000),
  fotos: z.array(z.string().max(64)).max(10).default([]),
});

// POST /api/community/onderwerpen/<id>/reacties: een reactie (lib/community). Alleen met een account; de pagina haalt daarna
// de nieuwe stand van de server op (router.refresh), dus hier alleen het id terug.
export const POST = withAuth<{ id: string }>(async (request, { params, principal }) => {
  const id = idUitPad(params.id);
  if (!id) throw AppError.notFound("Dit onderwerp bestaat niet.");
  await magSchrijven(principal);
  await enforceRateLimit({ name: "community-schrijven", identifier: principal.userId, limit: 10, windowSeconds: 60, message: "Rustig aan: wacht even voor je weer iets plaatst." });
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) throw AppError.validation("Schrijf eerst je reactie.");
  const tekst = schoneTekst(parsed.data.tekst);
  const fotos = [...new Set(parsed.data.fotos)];
  const fout = controleerReactie({ tekst, fotos: fotos.length });
  if (fout) throw AppError.validation(fout);
  const { reactie, onderwerp } = await maakReactie(id, { auteurId: principal.userId, tekst, fotoIds: fotos });
  return NextResponse.json({ ok: true, id: reactie.id, aantalReacties: onderwerp.aantalReacties }, { status: 201 });
});
