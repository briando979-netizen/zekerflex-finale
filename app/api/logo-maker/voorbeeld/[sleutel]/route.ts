import { AppError } from "@/lib/errors";
import { jsonError } from "@/lib/http/errors";
import { maakPng } from "@/lib/advertentie/beeld";
import { logoBoom } from "@/lib/logo/ontwerp";
import { logoVoorbeeldVan } from "@/lib/logo/voorbeelden";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/logo-maker/voorbeeld/<sleutel>: een voorbeeldlogo van een VERZONNEN bedrijf voor de landingspagina
// (lib/logo/voorbeelden.ts), uit dezelfde ontwerpcode. Vaste gegevens: één keer per proces gemaakt, daarna uit het geheugen.
const g = globalThis as typeof globalThis & { __zfLogoVoorbeelden?: Map<string, Promise<ArrayBuffer>> };
const geheugen = (g.__zfLogoVoorbeelden ??= new Map());

export async function GET(_request: Request, { params }: { params: Promise<{ sleutel: string }> }): Promise<Response> {
  try {
    const { sleutel } = await params;
    const voorbeeld = logoVoorbeeldVan(sleutel);
    if (!voorbeeld) throw AppError.notFound("Dit voorbeeld bestaat niet.");
    let beeld = geheugen.get(voorbeeld.sleutel);
    if (!beeld) {
      const { boom, breedte, hoogte } = logoBoom(voorbeeld.logo, voorbeeld.invoer, "kleur-wit", 720, false);
      beeld = maakPng(boom, breedte, hoogte);
      geheugen.set(voorbeeld.sleutel, beeld);
      beeld.catch(() => geheugen.delete(voorbeeld.sleutel));
    }
    return new Response((await beeld).slice(0), { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" } });
  } catch (err) {
    return jsonError(err);
  }
}
