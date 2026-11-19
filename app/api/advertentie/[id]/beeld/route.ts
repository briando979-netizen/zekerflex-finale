import { getPrincipal, hasRole } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { clientIp } from "@/lib/http/request";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rate-limit";
import { gegevensVan, maakBeeld } from "@/lib/advertentie/beeld";
import { beeldFout, telRender } from "@/lib/advertentie/beeld-antwoord";
import { watermerkBeeld } from "@/lib/advertentie/beeld-geheugen";
import { BEHEER_KLEIN, beeldBesluit, isAdvertentieId, isFormaatId, isOntwerpNr } from "@/lib/advertentie/regels";
import { haalAdvertentie } from "@/lib/advertentie/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/advertentie/<id>/beeld?ontwerp=1..6&formaat=vierkant|verhaal|liggend: één ontwerp als PNG.
// Wat eruit komt bepaalt alleen beeldBesluit (lib/advertentie/regels.ts): niet vrijgegeven = altijd klein en met ingebakken
// watermerk, in het gevraagde formaat (voor de schetsen op de pagina). De schone versie bestaat pas na vrijgave (alleen de gekozen
// ontwerpen), of voor een platformbeheerder met ?beheer=1 (de controle in Beheer; met &klein=1 een kleine maat voor de
// lijst). Alleen de watermerkversie komt in het gedeelde geheugen (lib/advertentie/beeld-geheugen.ts); een schoon beeld
// wordt na de controle hier elke keer zelf gemaakt. Het id is de sleutel en komt nooit in een log. Onbekend id = 404,
// te vaak = 429 (nooit 403).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const ip = clientIp(request);
    const ontwerp = Number(url.searchParams.get("ontwerp") ?? "1");
    const formaat = url.searchParams.get("formaat") ?? "vierkant";
    if (!isAdvertentieId(id) || !isOntwerpNr(ontwerp) || !isFormaatId(formaat)) throw AppError.notFound("Dit beeld bestaat niet.");
    await enforceRateLimit({ name: "advertentie-beeld", identifier: ip, limit: 600, windowSeconds: 600, message: "Te veel aanvragen. Probeer het over een paar minuten opnieuw." });
    const ad = await haalAdvertentie(id);
    if (!ad) throw AppError.notFound("Deze advertentie bestaat niet (meer).");

    let beheerder = false;
    if (url.searchParams.get("beheer") === "1") {
      const principal = await getPrincipal().catch(() => null);
      beheerder = Boolean(principal && hasRole(principal, "PLATFORM_ADMIN"));
    }
    const besluit = beeldBesluit({ ad, ontwerp, beheerder, formaat });
    const download = !besluit.watermerk && url.searchParams.get("download") === "1";
    let png: ArrayBuffer;
    if (besluit.watermerk) {
      png = await watermerkBeeld(`advertentie:${id}:${ontwerp}:${besluit.formaat}`, async () => {
        // alleen een nieuw beeld telt: wat uit het geheugen komt, kost niets
        await telRender("advertentie", ip);
        return maakBeeld(gegevensVan(ad), ontwerp, besluit);
      });
    } else {
      const klein = beheerder && !download && url.searchParams.get("klein") === "1";
      png = await maakBeeld(gegevensVan(ad), ontwerp, klein ? { ...besluit, breedte: BEHEER_KLEIN, hoogte: Math.round((BEHEER_KLEIN * besluit.hoogte) / besluit.breedte) } : besluit);
    }
    return new Response(png, {
      headers: {
        "Content-Type": "image/png",
        // niet vrijgegeven: nergens bewaren; vrijgegeven: alleen in de eigen browser, kort
        // het watermerkbeeld mag de eigen browser tien minuten bewaren (herladen kost dan niets); de schone versie van een
        // beheerder nooit ("private, no-store"), de vrijgegeven versie kort
        "Cache-Control": besluit.watermerk ? "private, max-age=600" : beheerder ? "private, no-store" : "private, max-age=300",
        "X-Robots-Tag": "noindex, noimageindex",
        ...(download ? { "Content-Disposition": `attachment; filename="advertentie-ontwerp-${ontwerp}-${besluit.formaat}.png"` } : {}),
      },
    });
  } catch (err) {
    const res = beeldFout(err);
    if (res.status >= 500) logger.error("advertentie op maat: beeld mislukt", { error: (err as Error).message });
    return res;
  }
}
