import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { jsonBegrensd } from "@/lib/http/body-grens";
import { jsonError } from "@/lib/http/errors";
import { clientIp } from "@/lib/http/request";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rate-limit";
import { recordServerEvent } from "@/lib/analytics/track";
import { valideerInvoer } from "@/lib/advertentie/regels";
import { maakAdvertentie } from "@/lib/advertentie/store";
import { maakTekst } from "@/lib/advertentie/tekst";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/advertentie: een bedrijf vult het formulier op /advertentie-op-maat in en krijgt het id van zijn advertentie
// terug (openbaar, zonder account of e-mailadres). Volgorde: begrensde body → invoer schoonmaken en begrenzen
// (lib/advertentie/regels.ts) → hooguit 8 per dag per IP (429, nooit 403; bij een storing in Redis gaat het verzoek door) →
// tekst van het taalmodel met alleen de eigen feiten, anders het sjabloon → bewaren. Het id komt nergens in een log.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const gelezen = await jsonBegrensd(request, 8_000);
    if (!gelezen.ok) throw AppError.validation("Body moet JSON zijn");
    // een robot vulde het lokveld: doen alsof het gelukt is zou een dood id geven, dus gewoon weigeren zonder iets te maken
    const lokveld = (gelezen.waarde as { website2?: unknown } | null)?.website2;
    if (typeof lokveld === "string" && lokveld.trim()) throw AppError.validation("Controleer je gegevens.");
    const invoer = valideerInvoer(gelezen.waarde);
    if (!invoer.ok) throw AppError.validation(invoer.fout, { veld: invoer.veld });
    await enforceRateLimit({
      name: "advertentie-maken",
      identifier: clientIp(request),
      limit: 8,
      windowSeconds: 86_400,
      message: "Je hebt vandaag al een paar advertenties gemaakt. Probeer het morgen opnieuw.",
    });
    const { tekst, bron } = await maakTekst(invoer.waarde);
    const ad = await maakAdvertentie(invoer.waarde, tekst, bron);
    void recordServerEvent({ path: "/advertentie-op-maat", label: "advertentie-gemaakt", meta: { bron } });
    return NextResponse.json({ ok: true, id: ad.id });
  } catch (err) {
    const res = jsonError(err);
    if (res.status >= 500) logger.error("advertentie op maat: maken mislukt", { error: (err as Error).message });
    return res;
  }
}
