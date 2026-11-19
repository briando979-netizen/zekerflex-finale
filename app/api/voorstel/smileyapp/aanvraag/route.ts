import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { jsonBegrensd } from "@/lib/http/body-grens";
import { jsonError } from "@/lib/http/errors";
import { lijst } from "@/lib/http/zod-lijst";
import { enforceRateLimit } from "@/lib/rate-limit";
import { valideerAanvraag } from "@/lib/voorstel/smileyapp-aanvraag-regels";
import { maakAanvraag } from "@/lib/voorstel/smileyapp-aanvragen";
import { beheerderAdressen } from "@/lib/voorstel/smileyapp-accounts";
import { stuurMelding } from "@/lib/voorstel/smileyapp-mail";
import { beheerVan, smileyPoort } from "@/lib/voorstel/smileyapp-poort";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Demo-aanvraag of partner-aanmelding van het SmileyApp-voorstel (openbaar onder
// /api/voorstel/smileyapp). POST {soort: "demo" | "partner", …} → {ok: true}.
// Volgorde: JSON en eigen site → limiet per IP → begrensde body → vorm (zod) en
// regels (lib/voorstel/smileyapp-aanvraag-regels.ts) → hooguit 5 aanvragen per
// 10 minuten per IP → bewaren → melding aan de beheerders. De aanvraag gaat
// alleen naar het eigen beheer; de melding bevat geen gegevens van de aanvrager.

const schema = z.object({
  soort: z.enum(["demo", "partner"]),
  naam: z.string().max(200),
  bedrijf: z.string().max(200),
  email: z.string().max(200),
  telefoon: z.string().max(60).optional(),
  pakket: z.string().max(20).optional(),
  interesses: lijst(z.string().max(60), { max: 10 }).optional(),
  dag: z.string().max(10).optional(),
  tijd: z.string().max(5).optional(),
  bericht: z.string().max(4000).optional(),
  toestemming: z.boolean(),
  /** lokveld: een mens ziet het niet en laat het leeg */
  lokveld: z.string().max(200).optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const ip = await smileyPoort(request, { json: true });
    const gelezen = await jsonBegrensd(request, 16_000);
    const parsed = schema.safeParse(gelezen.ok ? gelezen.waarde : null);
    if (!parsed.success) throw AppError.validation("Controleer je gegevens.");
    const { lokveld, ...invoer } = parsed.data;
    // een robot vulde het lokveld: doen alsof het gelukt is, niets bewaren en niets mailen
    if (lokveld?.trim()) return NextResponse.json({ ok: true });

    const controle = valideerAanvraag(invoer, new Date());
    if (!controle.ok) throw AppError.validation(controle.fout, { veld: controle.veld });
    await enforceRateLimit({ name: "smileyapp-aanvraag", identifier: ip, limit: 5, windowSeconds: 600, message: "Je hebt net al een paar aanvragen gestuurd. Probeer het over tien minuten opnieuw." });

    const aanvraag = await maakAanvraag(controle.waarde);
    // de melding mag mislukken: de aanvraag staat al in het beheer
    const beheer = beheerVan(request);
    void beheerderAdressen()
      .then((ontvangers) => stuurMelding({ soort: aanvraag.soort, bedrijf: aanvraag.bedrijf, beheer, ontvangers }))
      .catch(() => undefined);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
