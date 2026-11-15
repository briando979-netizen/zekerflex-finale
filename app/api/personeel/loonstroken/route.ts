import { NextResponse } from "next/server";
import { AppError, toErrorBody } from "@/lib/errors";
import { medewerkerContext } from "@/lib/horeca-personeel/context";
import { loonstrokenVan } from "@/lib/horeca-personeel/loonstroken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// De eigen loonstroken van een medewerker (app/personeel): alleen die van hemzelf, en alleen als zijn dashboard het onderdeel
// "loonstroken" heeft. Het bestand halen gaat via ./[id]/route.ts.
export async function GET(): Promise<NextResponse> {
  try {
    const c = await medewerkerContext();
    if (!c) throw AppError.unauthenticated();
    if (!c.dashboard.blokken.includes("loonstroken")) throw AppError.forbidden("Dit onderdeel staat niet op jouw dashboard.");
    const lijst = await loonstrokenVan(c.tenantId, c.medewerker.id);
    return NextResponse.json({ loonstroken: lijst.map((l) => ({ id: l.id, periode: l.periode, grootte: l.grootte, op: l.op })) });
  } catch (err) {
    const { status, body, headers } = toErrorBody(err);
    return NextResponse.json(body, { status, headers });
  }
}
