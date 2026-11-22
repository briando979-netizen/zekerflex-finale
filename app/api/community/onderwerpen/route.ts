import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { controleerOnderwerp, isCategorie, onderwerpPad, schoneTekst, schoneTitel } from "@/lib/community/regels";
import { maakOnderwerp } from "@/lib/community/store";
import { magSchrijven } from "@/lib/community/toegang";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  titel: z.string().max(400),
  tekst: z.string().max(12_000),
  categorie: z.string().max(40),
  fotos: z.array(z.string().max(64)).max(10).default([]),
});

// POST /api/community/onderwerpen: een nieuw onderwerp in de community (lib/community). Alleen met een account; achter de
// login (geen openbare route). De grenzen staan in lib/community/regels.ts, de daggrens telt in de opslag.
export const POST = withAuth(async (request, { principal }) => {
  await magSchrijven(principal);
  await enforceRateLimit({ name: "community-schrijven", identifier: principal.userId, limit: 10, windowSeconds: 60, message: "Rustig aan: wacht even voor je weer iets plaatst." });
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) throw AppError.validation("Vul een titel, een onderwerp en je tekst in.");
  const titel = schoneTitel(parsed.data.titel);
  const tekst = schoneTekst(parsed.data.tekst);
  const fotos = [...new Set(parsed.data.fotos)];
  const fout = controleerOnderwerp({ titel, tekst, categorie: parsed.data.categorie, fotos: fotos.length });
  if (fout) throw AppError.validation(fout);
  if (!isCategorie(parsed.data.categorie)) throw AppError.validation("Kies een onderwerp uit de lijst.");
  const o = await maakOnderwerp({ auteurId: principal.userId, titel, tekst, categorie: parsed.data.categorie, fotoIds: fotos });
  // in het uurbericht van de eigenaar, zonder naam of tekst (lib/ops/gebeurtenis.ts)
  void import("@/lib/ops/melder")
    .then(({ meldGebeurtenis }) => meldGebeurtenis({ soort: "overig", belang: "samenvatting", titel: "Nieuw onderwerp in de community", url: "/admin/community" }))
    .catch(() => undefined);
  return NextResponse.json({ ok: true, id: o.id, pad: onderwerpPad(o) }, { status: 201 });
});
