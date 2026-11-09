import { NextResponse } from "next/server";
import { AppError, toErrorBody } from "@/lib/errors";
import { clientIp } from "@/lib/http/request";
import { enforceRateLimit } from "@/lib/rate-limit";
import { chipSleutel } from "@/lib/kyc/chip/sessie";

// POST /api/chip/sleutel — de Android-app (ChipActivity) haalt met de eenmalige
// code de sleutel op om de chip te openen (BAC/PACE): documentnummer,
// geboortedatum en vervaldatum (yymmdd). Openbaar: de code is het bewijs
// (10 minuten geldig, hooguit 5 keer), IP-begrensd. De code staat in de body,
// nooit in het adres (lib/auth/public-routes.ts).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await enforceRateLimit({ name: "chip-sleutel", identifier: clientIp(request), limit: 30, windowSeconds: 600 });
    const body = (await request.json().catch(() => ({}))) as { code?: unknown };
    const code = typeof body.code === "string" ? body.code : "";
    const sleutel = await chipSleutel(code);
    if (!sleutel) throw AppError.notFound("Deze code is niet (meer) geldig. Start het chip lezen opnieuw vanuit ZekerFlex.");
    return NextResponse.json(sleutel, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
