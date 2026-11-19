import { getPrincipal, hasRole } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { jsonError } from "@/lib/http/errors";
import { clientIp } from "@/lib/http/request";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rate-limit";
import { maakPng } from "@/lib/advertentie/beeld";
import { watermerkBeeld } from "@/lib/advertentie/beeld-geheugen";
import { BEHEER_KLEIN, isAdvertentieId } from "@/lib/advertentie/regels";
import { logoBoom } from "@/lib/logo/ontwerp";
import { isLogoNr, isVariantId, logoBesluit } from "@/lib/logo/regels";
import { haalLogo } from "@/lib/logo/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/logo-maker/<id>/beeld?logo=1..6&variant=kleur-wit|kleur|wit|zwart|icoon: één logo als PNG.
// Wat eruit komt bepaalt alleen logoBesluit (lib/logo/regels.ts): niet vrijgegeven = altijd klein, in kleur op wit en
// met ingebakken watermerk. De grote, schone varianten bestaan alleen voor het gekozen logo na vrijgave, of voor een
// platformbeheerder met ?beheer=1 (met &klein=1 een kleine maat voor de lijst). Alleen de watermerkversie komt in het
// gedeelde geheugen (lib/advertentie/beeld-geheugen.ts). Het id is de sleutel en komt nooit in een log. Onbekend = 404,
// te vaak = 429.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const nr = Number(url.searchParams.get("logo") ?? "1");
    const variant = url.searchParams.get("variant") ?? "kleur-wit";
    if (!isAdvertentieId(id) || !isLogoNr(nr) || !isVariantId(variant)) throw AppError.notFound("Dit beeld bestaat niet.");
    await enforceRateLimit({ name: "logo-beeld", identifier: clientIp(request), limit: 400, windowSeconds: 600, message: "Te veel aanvragen. Probeer het over een paar minuten opnieuw." });
    const logo = await haalLogo(id);
    if (!logo) throw AppError.notFound("Dit logo bestaat niet (meer).");

    let beheerder = false;
    if (url.searchParams.get("beheer") === "1") {
      const principal = await getPrincipal().catch(() => null);
      beheerder = Boolean(principal && hasRole(principal, "PLATFORM_ADMIN"));
    }
    const besluit = logoBesluit({ logo, nr, beheerder, variant });
    const download = !besluit.watermerk && url.searchParams.get("download") === "1";
    const maak = (breedte: number) => {
      const { boom, hoogte } = logoBoom(nr, logo.invoer, besluit.variant, breedte, besluit.watermerk);
      return maakPng(boom, breedte, hoogte);
    };
    let png: ArrayBuffer;
    if (besluit.watermerk) {
      png = await watermerkBeeld(`logo:${id}:${nr}`, () => maak(besluit.breedte));
    } else {
      // op de pagina een scherm-maat, in de lijst van Beheer een kleine; alleen een download is op volle grootte
      const klein = beheerder && url.searchParams.get("klein") === "1";
      png = await maak(download ? besluit.breedte : Math.min(besluit.breedte, klein ? BEHEER_KLEIN : 960));
    }
    return new Response(png, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": besluit.watermerk || beheerder ? "private, no-store" : "private, max-age=300",
        "X-Robots-Tag": "noindex, noimageindex",
        ...(download ? { "Content-Disposition": `attachment; filename="logo-${besluit.variant}.png"` } : {}),
      },
    });
  } catch (err) {
    const res = jsonError(err);
    if (res.status >= 500) logger.error("logo maker: beeld mislukt", { error: (err as Error).message });
    return res;
  }
}
