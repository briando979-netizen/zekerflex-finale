import { NextResponse } from "next/server";
import { checkInternalToken } from "@/lib/internal-auth";
import { logger } from "@/lib/logger";
import { scrubBestaandeChatlog } from "@/lib/learn/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Eenmalig: de leerlijsten van de assistenten (learn-log:*) opschonen van e-mailadressen, telefoonnummers, rekeningnummers en
// BSN's die er vóór de scrub (lib/learn/schoon.ts) in kwamen. Eigen geheim, zoals elke /api/internal-route.
//   POST /api/internal/privacy/chatlog-scrub            → droge telling: alleen aantallen, er wordt niets geschreven
//   POST /api/internal/privacy/chatlog-scrub?schrijf=1  → schrijft; idempotent (een tweede keer vindt niets meer)
// Het antwoord bevat alleen aantallen, nooit inhoud; er wordt ook niets van de inhoud gelogd.
export async function POST(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
  const schrijf = new URL(request.url).searchParams.get("schrijf") === "1";
  try {
    const telling = await scrubBestaandeChatlog(!schrijf);
    logger.info("chatlog-scrub", { schrijf, regels: telling.regels, metPersoonsgegevens: telling.metPersoonsgegevens, herschreven: telling.herschreven });
    return NextResponse.json({ modus: schrijf ? "geschreven" : "droog", ...telling });
  } catch (e) {
    logger.error("chatlog-scrub mislukt", { soort: e instanceof Error ? e.name : "onbekend" });
    return NextResponse.json({ error: { code: "INTERNAL", message: "Opschonen mislukt." } }, { status: 500 });
  }
}
