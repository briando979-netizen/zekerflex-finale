import { AppError } from "@/lib/errors";
import { jsonError } from "@/lib/http/errors";
import { maakBeeld } from "@/lib/advertentie/beeld";
import { VOORBEELD_ZIJDE } from "@/lib/advertentie/regels";
import { voorbeeldVan } from "@/lib/advertentie/voorbeelden";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/advertentie/voorbeeld/<sleutel>: een voorbeeldadvertentie van een VERZONNEN bedrijf voor de landingspagina
// (lib/advertentie/voorbeelden.ts), uit dezelfde ontwerpcode, klein en vierkant. Vaste gegevens, dus één keer per proces
// gemaakt en daarna uit het geheugen (globalThis: Next bundelt routes apart).
const g = globalThis as typeof globalThis & { __zfAdvertentieVoorbeelden?: Map<string, Promise<ArrayBuffer>> };
const geheugen = (g.__zfAdvertentieVoorbeelden ??= new Map());

export async function GET(_request: Request, { params }: { params: Promise<{ sleutel: string }> }): Promise<Response> {
  try {
    const { sleutel } = await params;
    const voorbeeld = voorbeeldVan(sleutel);
    if (!voorbeeld) throw AppError.notFound("Dit voorbeeld bestaat niet.");
    let beeld = geheugen.get(voorbeeld.sleutel);
    if (!beeld) {
      beeld = maakBeeld(voorbeeld.gegevens, voorbeeld.ontwerp, { watermerk: false, formaat: "vierkant", breedte: VOORBEELD_ZIJDE, hoogte: VOORBEELD_ZIJDE });
      geheugen.set(voorbeeld.sleutel, beeld);
      beeld.catch(() => geheugen.delete(voorbeeld.sleutel));
    }
    return new Response((await beeld).slice(0), { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" } });
  } catch (err) {
    return jsonError(err);
  }
}
