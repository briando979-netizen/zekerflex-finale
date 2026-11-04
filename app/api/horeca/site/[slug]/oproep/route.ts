import { NextResponse } from "next/server";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { zelfdeHerkomst } from "@/lib/rijschool/herkomst";
import { gastOproepSchema, lees } from "@/lib/horeca/schema";
import { publiekeZaak } from "@/lib/horeca/toegang";
import { heeftModule } from "@/lib/horeca/modules";
import { tafelVanCode } from "@/lib/horeca/bestellingen";
import { roep } from "@/lib/horeca/oproepen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Een gast aan tafel roept de ober of vraagt de rekening (knop op de
// QR-bestelpagina). Openbaar, daarom: IP-begrensd, alleen van de eigen site en
// alleen met een geldige tafelcode. De bediening ziet het op de handheld.
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }): Promise<NextResponse> {
  try {
    if (!zelfdeHerkomst(request.headers, request.url)) throw AppError.forbidden("Verzoek van een andere website geweigerd.");
    await enforceRateLimit({ name: "horeca-oproep", identifier: clientIp(request), limit: 8, windowSeconds: 600, message: "Je hebt de bediening al geroepen. Ze komen eraan." });
    const zaak = await publiekeZaak((await params).slug);
    if (!heeftModule(zaak, "qr")) throw AppError.precondition("Deze zaak gebruikt geen bestellen aan tafel.");
    const o = lees(gastOproepSchema, await request.json().catch(() => null));
    const tafel = await tafelVanCode(zaak.id, o.code);
    if (!tafel) throw AppError.notFound("Deze QR-code werkt niet meer. Vraag de bediening om een nieuwe.");
    await roep(zaak.id, { id: tafel.id, naam: tafel.naam }, o.soort);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body, headers } = toErrorBody(err);
    return NextResponse.json(body, { status, headers });
  }
}
