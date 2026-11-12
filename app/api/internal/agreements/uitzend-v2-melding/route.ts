import { NextResponse } from "next/server";
import { checkInternalToken } from "@/lib/internal-auth";
import { logger } from "@/lib/logger";
import { meldUitzendBijgewerkt } from "@/lib/agreements/uitzend-melding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Eenmalig: de uitzendkrachten die alleen een geldige overeenkomst in een oudere versie hebben, krijgen één push in hun app-taal
// ("je uitzendovereenkomst is bijgewerkt"). Eigen geheim, zoals elke /api/internal-route.
//   POST /api/internal/agreements/uitzend-v2-melding             → droge telling: alleen aantallen, er gaat niets uit
//   POST /api/internal/agreements/uitzend-v2-melding?verstuur=1  → verstuurt; per werker één keer, nooit naar testadressen
// Het antwoord bevat alleen aantallen; er wordt geen id, naam of adres gelogd.
export async function POST(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
  const verstuur = new URL(request.url).searchParams.get("verstuur") === "1";
  try {
    const telling = await meldUitzendBijgewerkt({ verstuur });
    logger.info("uitzend-v2-melding", { verstuur, ...telling });
    return NextResponse.json({ modus: verstuur ? "verstuurd" : "droog", ...telling });
  } catch (e) {
    logger.error("uitzend-v2-melding mislukt", { soort: e instanceof Error ? e.name : "onbekend" });
    return NextResponse.json({ error: { code: "INTERNAL", message: "Melden mislukt." } }, { status: 500 });
  }
}
