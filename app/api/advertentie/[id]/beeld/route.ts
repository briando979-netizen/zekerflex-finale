import { getPrincipal, hasRole } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { jsonError } from "@/lib/http/errors";
import { clientIp } from "@/lib/http/request";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rate-limit";
import { gegevensVan, maakBeeld } from "@/lib/advertentie/beeld";
import { beeldBesluit, isAdvertentieId, isFormaatId, isOntwerpNr } from "@/lib/advertentie/regels";
import { haalAdvertentie } from "@/lib/advertentie/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/advertentie/<id>/beeld?ontwerp=1|2|3&formaat=vierkant|verhaal|liggend: één ontwerp als PNG.
// Wat eruit komt bepaalt alleen beeldBesluit (lib/advertentie/regels.ts): niet vrijgegeven = altijd klein, vierkant en met
// ingebakken watermerk, wat er ook gevraagd wordt. De schone versie bestaat pas na vrijgave (alleen de gekozen
// ontwerpen), of voor een platformbeheerder met ?beheer=1 (de controle in Beheer). Het id is de sleutel en komt nooit
// in een log. Onbekend id = 404, te vaak = 429 (nooit 403).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const ontwerp = Number(url.searchParams.get("ontwerp") ?? "1");
    const formaat = url.searchParams.get("formaat") ?? "vierkant";
    if (!isAdvertentieId(id) || !isOntwerpNr(ontwerp) || !isFormaatId(formaat)) throw AppError.notFound("Dit beeld bestaat niet.");
    await enforceRateLimit({ name: "advertentie-beeld", identifier: clientIp(request), limit: 240, windowSeconds: 600, message: "Te veel aanvragen. Probeer het over een paar minuten opnieuw." });
    const ad = await haalAdvertentie(id);
    if (!ad) throw AppError.notFound("Deze advertentie bestaat niet (meer).");

    let beheerder = false;
    if (url.searchParams.get("beheer") === "1") {
      const principal = await getPrincipal().catch(() => null);
      beheerder = Boolean(principal && hasRole(principal, "PLATFORM_ADMIN"));
    }
    const besluit = beeldBesluit({ ad, ontwerp, beheerder, formaat });
    const png = await maakBeeld(gegevensVan(ad), ontwerp, besluit);
    const download = !besluit.watermerk && url.searchParams.get("download") === "1";
    return new Response(png, {
      headers: {
        "Content-Type": "image/png",
        // niet vrijgegeven: nergens bewaren; vrijgegeven: alleen in de eigen browser, kort
        "Cache-Control": besluit.watermerk || beheerder ? "private, no-store" : "private, max-age=300",
        "X-Robots-Tag": "noindex, noimageindex",
        ...(download ? { "Content-Disposition": `attachment; filename="advertentie-ontwerp-${ontwerp}-${besluit.formaat}.png"` } : {}),
      },
    });
  } catch (err) {
    const res = jsonError(err);
    if (res.status >= 500) logger.error("advertentie op maat: beeld mislukt", { error: (err as Error).message });
    return res;
  }
}
