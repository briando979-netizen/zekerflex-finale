import { NextResponse } from "next/server";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { chipLezing, chipTekst } from "@/lib/kyc/chip/sessie";

// GET /api/onboarding/chip/status — de ID-scan vraagt na terugkomst uit de app
// of de chip gelezen is. Alleen de uitslag; geen nummer, naam of foto.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "FREELANCER");
    const l = await chipLezing(principal.userId);
    return NextResponse.json(
      { lezing: l ? { op: l.op, echt: l.echt, nummerKlopt: l.nummerKlopt, ketenOk: l.ketenOk, land: l.land, tekst: chipTekst(l) } : null },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
