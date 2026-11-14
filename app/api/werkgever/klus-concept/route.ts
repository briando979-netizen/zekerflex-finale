import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { haalConceptVoorGebruiker, wisConceptVoorGebruiker } from "@/lib/klusconcept/server-opslag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/werkgever/klus-concept — het klusconcept dat bij het aanmelden is meegegeven (lib/klusconcept/server-opslag.ts),
// voor NewShiftForm als deze browser er lokaal geen heeft (bevestigingsmail op een ander apparaat geopend).
// Alleen het eigen concept van de ingelogde gebruiker; een verlopen concept is al weg.
export async function GET(): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const concept = await haalConceptVoorGebruiker(principal.userId, Date.now(), amsterdamDayKey(new Date()));
    return NextResponse.json({ concept });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// DELETE /api/werkgever/klus-concept — vergeten (de werkgever wil met een leeg formulier beginnen).
export async function DELETE(): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    await wisConceptVoorGebruiker(principal.userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
