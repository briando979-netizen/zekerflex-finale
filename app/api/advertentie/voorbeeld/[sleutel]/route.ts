import { AppError } from "@/lib/errors";
import { beeldFout } from "@/lib/advertentie/beeld-antwoord";
import { maakBeeld } from "@/lib/advertentie/beeld";
import { FORMATEN, VOORBEELD_ZIJDE, isFormaatId } from "@/lib/advertentie/regels";
import { voorbeeldVan } from "@/lib/advertentie/voorbeelden";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/advertentie/voorbeeld/<sleutel>: een voorbeeldadvertentie van een VERZONNEN bedrijf voor de landingspagina
// (lib/advertentie/voorbeelden.ts), uit dezelfde ontwerpcode, klein en vierkant. Vaste gegevens, dus één keer per proces
// gemaakt en daarna uit het geheugen (globalThis: Next bundelt routes apart).
const g = globalThis as typeof globalThis & { __zfAdvertentieVoorbeelden?: Map<string, Promise<ArrayBuffer>> };
const geheugen = (g.__zfAdvertentieVoorbeelden ??= new Map());

export async function GET(request: Request, { params }: { params: Promise<{ sleutel: string }> }): Promise<Response> {
  try {
    const { sleutel } = await params;
    const voorbeeld = voorbeeldVan(sleutel);
    if (!voorbeeld) throw AppError.notFound("Dit voorbeeld bestaat niet.");
    const ruw = new URL(request.url).searchParams.get("formaat");
    const formaat = isFormaatId(ruw) ? ruw : "vierkant";
    const k = `${voorbeeld.sleutel}:${formaat}`;
    let beeld = geheugen.get(k);
    if (!beeld) {
      const f = FORMATEN[formaat];
      const schaal = VOORBEELD_ZIJDE / Math.max(f.breedte, f.hoogte);
      beeld = maakBeeld(voorbeeld.gegevens, voorbeeld.ontwerp, { watermerk: false, formaat, breedte: Math.round(f.breedte * schaal), hoogte: Math.round(f.hoogte * schaal) }, true);
      geheugen.set(k, beeld);
      beeld.catch(() => geheugen.delete(k));
    }
    return new Response((await beeld).slice(0), { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" } });
  } catch (err) {
    return beeldFout(err);
  }
}
