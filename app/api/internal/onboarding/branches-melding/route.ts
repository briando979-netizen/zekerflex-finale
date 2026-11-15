import { NextResponse } from "next/server";
import { checkInternalToken } from "@/lib/internal-auth";
import { logger } from "@/lib/logger";
import { meldBranchesKiezen } from "@/lib/onboarding/branches-melding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Eenmalig: de werkers die zich tussen 6 en 9 november aanmeldden en nog geen branches kozen, krijgen één push (of mail) in hun app-taal
// ("Kies je branches voor klussen die bij je passen"). Eigen geheim, zoals elke /api/internal-route.
//   POST /api/internal/onboarding/branches-melding             → droge telling: alleen aantallen, er gaat niets uit
//   POST /api/internal/onboarding/branches-melding?verstuur=1  → verstuurt; per werker één keer, nooit naar testadressen
// Het antwoord bevat alleen aantallen; er wordt geen id, naam of adres gelogd.
export async function POST(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
  const verstuur = new URL(request.url).searchParams.get("verstuur") === "1";
  try {
    const telling = await meldBranchesKiezen({ verstuur });
    logger.info("branches-melding", { verstuur, ...telling });
    return NextResponse.json({ modus: verstuur ? "verstuurd" : "droog", ...telling });
  } catch (e) {
    logger.error("branches-melding mislukt", { soort: e instanceof Error ? e.name : "onbekend" });
    return NextResponse.json({ error: { code: "INTERNAL", message: "Melden mislukt." } }, { status: 500 });
  }
}
