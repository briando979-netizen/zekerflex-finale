import { NextResponse } from "next/server";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { zelfdeHerkomst } from "@/lib/rijschool/herkomst";
import { koppel, vergeetCookie } from "@/lib/horeca/apparaten";
import { koppelSchema, lees } from "@/lib/horeca/schema";
import { leesKoppelcode } from "@/lib/horeca/schermen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Een apparaat koppelen aan een zaak met de code uit het beheer (Horeca →
// Schermen). Openbaar (het apparaat heeft nog geen login), daarom: IP-begrensd,
// alleen van de eigen site, en de code is 15 minuten geldig en één keer te
// gebruiken. DELETE ontkoppelt dit apparaat aan de eigen kant (cookie weg).

const fout = (err: unknown) => {
  const { status, body, headers } = toErrorBody(err);
  return NextResponse.json(body, { status, headers });
};

export async function POST(request: Request): Promise<NextResponse> {
  try {
    if (!zelfdeHerkomst(request.headers, request.url)) throw AppError.forbidden("Verzoek van een andere website geweigerd.");
    await enforceRateLimit({ name: "horeca-koppel", identifier: clientIp(request), limit: 10, windowSeconds: 600, message: "Te veel pogingen. Wacht tien minuten en probeer het opnieuw." });
    const { code: invoer } = lees(koppelSchema, await request.json().catch(() => null));
    const code = leesKoppelcode(invoer);
    if (!code) throw AppError.validation("Een koppelcode heeft zes tekens, bijvoorbeeld ABC-234.");
    const { apparaat } = await koppel(code);
    return NextResponse.json({ rol: apparaat.rol, naam: apparaat.naam });
  } catch (err) {
    return fout(err);
  }
}

export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    if (!zelfdeHerkomst(request.headers, request.url)) throw AppError.forbidden("Verzoek van een andere website geweigerd.");
    await vergeetCookie();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fout(err);
  }
}
