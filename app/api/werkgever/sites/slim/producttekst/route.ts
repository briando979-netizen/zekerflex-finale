import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { siteTenantOf } from "@/lib/sites/access";
import { schrijfProductTekst } from "@/lib/sites/producttekst-ai";
import { winkelSiteOf } from "@/lib/sites/store";
import { winkelVan } from "@/lib/sites/winkel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// ons eigen model ("alles gratis") rekent op de CPU: een antwoord kan een minuut duren
export const maxDuration = 120;

const schema = z.object({ productId: z.string().regex(/^p[a-z0-9]{6,20}$/) });

// POST /api/werkgever/sites/slim/producttekst { productId } — Studio → Webshop → Slim: een voorstel
// voor de korte zin en de omschrijving van één product van de eigen webshop. Slaat niets op: de
// eigenaar past het voorstel aan en bewaart het zelf (PUT …/sites/winkel). Per bedrijf 60 per uur.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const tenantId = await siteTenantOf(p);
    const { productId } = schema.parse(await request.json().catch(() => ({})));
    // de winkel zoals hij opgeslagen is (dezelfde site als bij opslaan), nooit wat het scherm meestuurt
    const site = await winkelSiteOf(tenantId);
    if (!site) throw AppError.notFound("Maak eerst een webshop.");
    const product = winkelVan(site).producten.find((x) => x.id === productId);
    if (!product) throw AppError.notFound("Dit product bestaat niet (meer). Ververs de pagina.");
    await enforceRateLimit({ name: "winkel-producttekst", identifier: tenantId, limit: 60, windowSeconds: 3600, message: "Je hebt het afgelopen uur al veel teksten laten schrijven. Probeer het over een uur opnieuw." });
    return NextResponse.json({ voorstel: await schrijfProductTekst(product, site.bedrijf.naam) });
  } catch (err) {
    const { status, body, headers } = toErrorBody(err);
    return NextResponse.json(body, { status, headers });
  }
}
