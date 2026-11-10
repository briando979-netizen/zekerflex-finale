import { NextResponse } from "next/server";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getFiscal, setFiscal } from "@/lib/fiscal/store";
import { euroNaarCent, korBinnenGrens, korIngang } from "@/lib/fiscal/kor";
import { amsterdamDayKey } from "@/lib/time/amsterdam";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/me/fiscal/kor { omzetDitJaar, omzetVorigJaar }: de werker meldt dat hij de KOR bij de
// Belastingdienst heeft aangevraagd (indienen doet hij zelf, met DigiD; lib/fiscal/kor.ts). De KOR
// gaat pas aan als een medewerker de bevestiging zag (POST /api/me/fiscal/kor/bevestiging).
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    requireRole(p, "FREELANCER");
    await enforceRateLimit({ name: "me-kor", identifier: p.userId, limit: 20, windowSeconds: 3600, message: "Even te vaak. Probeer het later opnieuw." });
    const body = (await request.json().catch(() => ({}))) as { omzetDitJaar?: unknown; omzetVorigJaar?: unknown };
    const dit = euroNaarCent(body.omzetDitJaar);
    const vorig = euroNaarCent(body.omzetVorigJaar ?? "0");
    if (dit === null || vorig === null) throw AppError.validation("Vul je omzet in als bedrag in euro's, bijvoorbeeld 12000.");
    if (!korBinnenGrens(dit, vorig)) throw AppError.validation("Je omzet is hoger dan € 20.000. Dan kun je de KOR niet gebruiken.");
    const nu = new Date();
    const { ingang } = korIngang(amsterdamDayKey(nu));
    const fiscal = await setFiscal(p.userId, {
      korAanvraag: { stand: "ingediend", ingang, ingediendOp: nu.toISOString(), omzetDitJaarCent: dit, omzetVorigJaarCent: vorig },
    });
    return NextResponse.json({ korAanvraag: fiscal.korAanvraag ?? null });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// DELETE /api/me/fiscal/kor: de aanvraag intrekken (alleen zolang de KOR nog niet is bevestigd).
export async function DELETE(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    requireRole(p, "FREELANCER");
    const fiscal = await getFiscal(p.userId);
    if (fiscal.korAanvraag?.stand === "bevestigd") throw AppError.conflict("Je KOR is al bevestigd. Wil je stoppen, meld je dan af bij de Belastingdienst en laat het ons weten.");
    await setFiscal(p.userId, { korAanvraag: null });
    return NextResponse.json({ korAanvraag: null });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
