import { NextResponse } from "next/server";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { publiekeZaak } from "@/lib/horeca/toegang";
import { bestellingVoorGast } from "@/lib/horeca/bestellingen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// De gast volgt zijn bestelling (?code=<tafelcode>&id=<bestelling>). Alleen met
// de tafelcode erbij, zodat een geraden id niets oplevert.
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }): Promise<NextResponse> {
  try {
    await enforceRateLimit({ name: "horeca-bestelling-volgen", identifier: clientIp(request), limit: 240, windowSeconds: 600 });
    const zaak = await publiekeZaak((await params).slug);
    const url = new URL(request.url);
    const code = url.searchParams.get("code") ?? "";
    const id = url.searchParams.get("id") ?? "";
    if (!code || !id || code.length > 40 || id.length > 40) throw AppError.validation("Onbekende bestelling.");
    const b = await bestellingVoorGast(zaak.id, code, id);
    if (!b) throw AppError.notFound("Bestelling niet gevonden.");
    return NextResponse.json(b, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    const { status, body, headers } = toErrorBody(err);
    return NextResponse.json(body, { status, headers });
  }
}
