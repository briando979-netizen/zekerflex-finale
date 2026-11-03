import { NextResponse } from "next/server";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { publiekeZaak } from "@/lib/horeca/toegang";
import { heeftModule } from "@/lib/horeca/modules";
import { isDatum } from "@/lib/horeca/reserveren";
import { vrijeTijden } from "@/lib/horeca/reserveringen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Welke tijden zijn vrij? ?datum=JJJJ-MM-DD&personen=N. Openbaar en IP-begrensd;
// geeft alleen tijden en vrij/vol, nooit wie er al zit.
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }): Promise<NextResponse> {
  try {
    await enforceRateLimit({ name: "horeca-beschikbaar", identifier: clientIp(request), limit: 240, windowSeconds: 600 });
    const zaak = await publiekeZaak((await params).slug);
    if (!heeftModule(zaak, "reserveren")) throw AppError.precondition("Online reserveren staat bij deze zaak uit. Bel ons gerust.");
    const q = new URL(request.url).searchParams;
    const datum = q.get("datum") ?? "";
    const personen = Number(q.get("personen"));
    if (!isDatum(datum) || !Number.isInteger(personen) || personen < 1 || personen > 100) throw AppError.validation("Kies een datum en het aantal personen.");
    const { tijden } = await vrijeTijden(zaak, datum, personen);
    return NextResponse.json({ datum, tijden }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    const { status, body, headers } = toErrorBody(err);
    return NextResponse.json(body, { status, headers });
  }
}
