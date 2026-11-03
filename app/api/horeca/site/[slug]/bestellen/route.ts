import { NextResponse } from "next/server";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { zelfdeHerkomst } from "@/lib/rijschool/herkomst";
import { gastBestellingSchema, lees } from "@/lib/horeca/schema";
import { publiekeZaak } from "@/lib/horeca/toegang";
import { heeftModule } from "@/lib/horeca/modules";
import { plaatsBestelling, tafelVanCode } from "@/lib/horeca/bestellingen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Een gast bestelt via de QR-code op tafel. Openbaar (lib/auth/public-routes.ts),
// daarom: IP-begrensd, alleen van de eigen site, alleen met een geldige tafelcode
// en als de zaak bestellen via QR aan heeft. Prijzen komen van de server.
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }): Promise<NextResponse> {
  try {
    if (!zelfdeHerkomst(request.headers, request.url)) throw AppError.forbidden("Verzoek van een andere website geweigerd.");
    await enforceRateLimit({ name: "horeca-bestellen", identifier: clientIp(request), limit: 30, windowSeconds: 600 });
    const zaak = await publiekeZaak((await params).slug);
    if (!heeftModule(zaak, "qr")) throw AppError.precondition("Bestellen via de QR-code staat bij deze zaak uit. Vraag het de bediening.");
    const b = lees(gastBestellingSchema, await request.json().catch(() => null));
    const tafel = await tafelVanCode(zaak.id, b.code);
    if (!tafel) throw AppError.notFound("Deze QR-code werkt niet meer. Vraag de bediening om een nieuwe.");
    const best = await plaatsBestelling(zaak, { tafelId: tafel.id, mand: b.mand, opmerking: b.opmerking, naam: b.naam, bron: "qr" });
    return NextResponse.json({ id: best.id, nummer: best.nummer, totaalCent: best.totaalCent });
  } catch (err) {
    const { status, body, headers } = toErrorBody(err);
    return NextResponse.json(body, { status, headers });
  }
}
