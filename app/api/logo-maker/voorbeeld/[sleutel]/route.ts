import { AppError } from "@/lib/errors";
import { beeldFout } from "@/lib/advertentie/beeld-antwoord";
import { maakLogoPng } from "@/lib/logo/beeld";
import { isThemaId } from "@/lib/logo/regels";
import { logoVoorbeeldVan } from "@/lib/logo/voorbeelden";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/logo-maker/voorbeeld/<sleutel>?thema=donker|licht|kleur: een voorbeeldlogo van een VERZONNEN merk voor de
// landingspagina's (lib/logo/voorbeelden.ts), uit dezelfde ontwerpcode. Vaste gegevens: één keer per proces gemaakt,
// daarna uit het geheugen (hooguit 9 merken × 3 ondergronden).
const g = globalThis as typeof globalThis & { __zfLogoVoorbeelden2?: Map<string, Promise<ArrayBuffer>> };
const geheugen = (g.__zfLogoVoorbeelden2 ??= new Map());

export async function GET(request: Request, { params }: { params: Promise<{ sleutel: string }> }): Promise<Response> {
  try {
    const { sleutel } = await params;
    const voorbeeld = logoVoorbeeldVan(sleutel);
    if (!voorbeeld) throw AppError.notFound("Dit voorbeeld bestaat niet.");
    const ruw = new URL(request.url).searchParams.get("thema");
    const thema = isThemaId(ruw) ? ruw : "donker";
    const k = `${voorbeeld.sleutel}:${thema}`;
    let beeld = geheugen.get(k);
    if (!beeld) {
      beeld = maakLogoPng(voorbeeld.logo, voorbeeld.invoer, { soort: "thema", thema }, 640, false, true);
      geheugen.set(k, beeld);
      beeld.catch(() => geheugen.delete(k));
    }
    return new Response((await beeld).slice(0), { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=604800, stale-while-revalidate=2592000" } });
  } catch (err) {
    return beeldFout(err);
  }
}
