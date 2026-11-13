import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { siteTenantOf } from "@/lib/sites/access";
import { blokTekstInvoer } from "@/lib/sites/bloktekst";
import { schrijfBlokTekst } from "@/lib/sites/bloktekst-ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// ons eigen model ("alles gratis") rekent op de CPU: een antwoord kan een minuut duren
export const maxDuration = 120;

const schema = z.object({
  soort: z.string().max(60),
  bedrijf: z.string().max(100),
  plaats: z.string().max(80),
  kop: z.string().max(160),
  tekst: z.string().max(4000),
  wens: z.string().max(300),
});

// POST /api/werkgever/sites/slim/bloktekst — de bouwer → "Schrijf met AI": een voorstel voor de kop en de tekst van één
// blok. Slaat niets op: de ondernemer kiest zelf of hij het voorstel gebruikt. Alleen de beheerder van een bedrijf
// (zelfde regel als de bouwer); per bedrijf 40 per uur.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const tenantId = await siteTenantOf(p);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw AppError.validation("Dat konden we niet lezen. Probeer het opnieuw.");
    await enforceRateLimit({ name: "site-bloktekst", identifier: tenantId, limit: 40, windowSeconds: 3600, message: "Je hebt het afgelopen uur al veel teksten laten schrijven. Probeer het over een uur opnieuw." });
    return NextResponse.json({ voorstel: await schrijfBlokTekst(blokTekstInvoer(parsed.data)) });
  } catch (err) {
    const { status, body, headers } = toErrorBody(err);
    return NextResponse.json(body, { status, headers });
  }
}
