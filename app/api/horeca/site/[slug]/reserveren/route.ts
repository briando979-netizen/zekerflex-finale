import { after, NextResponse } from "next/server";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { zelfdeHerkomst } from "@/lib/rijschool/herkomst";
import { gastReserveringSchema, lees } from "@/lib/horeca/schema";
import { publiekeZaak } from "@/lib/horeca/toegang";
import { heeftModule } from "@/lib/horeca/modules";
import { maakReservering } from "@/lib/horeca/reserveringen";
import { bevestigingGast, nieuweReserveringZaak, verstuur } from "@/lib/horeca/mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Een gast reserveert online een tafel. Openbaar (lib/auth/public-routes.ts):
// IP-begrensd, alleen van de eigen site, en de server controleert onder een
// slot opnieuw of de tijd nog vrij is (lib/horeca/reserveringen.ts).
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }): Promise<NextResponse> {
  try {
    if (!zelfdeHerkomst(request.headers, request.url)) throw AppError.forbidden("Verzoek van een andere website geweigerd.");
    await enforceRateLimit({ name: "horeca-reserveren", identifier: clientIp(request), limit: 8, windowSeconds: 3600 });
    const zaak = await publiekeZaak((await params).slug);
    if (!heeftModule(zaak, "reserveren")) throw AppError.precondition("Online reserveren staat bij deze zaak uit. Bel ons gerust.");
    const r = lees(gastReserveringSchema, await request.json().catch(() => null));
    const res = await maakReservering(zaak, r, "online");
    // bevestiging aan de gast (met annuleerlink) en een seintje aan de zaak, na het antwoord
    after(async () => {
      await verstuur(bevestigingGast(zaak, res));
      await verstuur(nieuweReserveringZaak(zaak, res));
    });
    return NextResponse.json({ id: res.id, datum: res.datum, tijd: res.tijd, personen: res.personen });
  } catch (err) {
    const { status, body, headers } = toErrorBody(err);
    return NextResponse.json(body, { status, headers });
  }
}
