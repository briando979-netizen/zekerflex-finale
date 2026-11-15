import { NextResponse } from "next/server";
import { AppError, toErrorBody } from "@/lib/errors";
import { medewerkerContext } from "@/lib/horeca-personeel/context";
import { leesDocumentBestand } from "@/lib/horeca-personeel/documenten";
import { pdfAntwoord } from "@/lib/horeca-personeel/loonstroken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Een document downloaden: alleen wat voor iedereen is of voor deze medewerker. Het document van een collega bestaat voor hem niet.
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const c = await medewerkerContext();
    if (!c) throw AppError.unauthenticated();
    if (!c.dashboard.blokken.includes("documenten")) throw AppError.forbidden("Dit onderdeel staat niet op jouw dashboard.");
    const { id } = await ctx.params;
    const f = await leesDocumentBestand(c.tenantId, id, c.medewerker.id);
    return pdfAntwoord(f.bytes, f.bestand);
  } catch (err) {
    const { status, body, headers } = toErrorBody(err);
    return NextResponse.json(body, { status, headers });
  }
}
