import { NextResponse } from "next/server";
import { AppError, toErrorBody } from "@/lib/errors";
import { medewerkerContext } from "@/lib/horeca-personeel/context";
import { leesLoonstrookBestand, pdfAntwoord } from "@/lib/horeca-personeel/loonstroken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Een eigen loonstrook downloaden. Een id van een strook van een collega geeft een gewone "bestaat niet": het bestand wordt
// alleen gelezen als de strook bij deze medewerker hoort.
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const c = await medewerkerContext();
    if (!c) throw AppError.unauthenticated();
    if (!c.dashboard.blokken.includes("loonstroken")) throw AppError.forbidden("Dit onderdeel staat niet op jouw dashboard.");
    const { id } = await ctx.params;
    const f = await leesLoonstrookBestand(c.tenantId, id, c.medewerker.id);
    return pdfAntwoord(f.bytes, f.bestand);
  } catch (err) {
    const { status, body, headers } = toErrorBody(err);
    return NextResponse.json(body, { status, headers });
  }
}
