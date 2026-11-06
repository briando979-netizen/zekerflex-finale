import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { featureEnabled } from "@/lib/flags";
import { kanalenVoor } from "@/lib/locatie/portofoon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/locatie/portofoon — mijn kanalen: als werker de klussen waarvoor ik
// nu ingepland sta (en hun vestiging), als team van een bedrijf alle vestigingen
// en de klussen van vandaag. Alleen bedrijven met de module aan (lib/locatie/portofoon.ts).
export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    if (!(await featureEnabled("locatie-modules", { userId: p.userId }))) return NextResponse.json({ kanalen: [], uit: true });
    return NextResponse.json({ kanalen: await kanalenVoor(p), ik: { userId: p.userId, naam: p.fullName } });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
