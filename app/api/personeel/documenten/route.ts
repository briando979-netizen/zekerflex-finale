import { NextResponse } from "next/server";
import { AppError, toErrorBody } from "@/lib/errors";
import { medewerkerContext } from "@/lib/horeca-personeel/context";
import { documentenVan } from "@/lib/horeca-personeel/documenten";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// De documenten van een medewerker (app/personeel): die voor iedereen en zijn eigen, alleen als zijn dashboard het onderdeel
// "documenten" heeft. Het bestand halen gaat via ./[id]/route.ts.
export async function GET(): Promise<NextResponse> {
  try {
    const c = await medewerkerContext();
    if (!c) throw AppError.unauthenticated();
    if (!c.dashboard.blokken.includes("documenten")) throw AppError.forbidden("Dit onderdeel staat niet op jouw dashboard.");
    const lijst = await documentenVan(c.tenantId, c.medewerker.id);
    return NextResponse.json({ documenten: lijst.map((d) => ({ id: d.id, titel: d.titel, soort: d.soort, grootte: d.grootte, op: d.op, voorIedereen: d.medewerkerId === null })) });
  } catch (err) {
    const { status, body, headers } = toErrorBody(err);
    return NextResponse.json(body, { status, headers });
  }
}
