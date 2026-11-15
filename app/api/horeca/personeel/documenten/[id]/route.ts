import { NextResponse } from "next/server";
import { toErrorBody } from "@/lib/errors";
import { eisBeheer } from "@/lib/horeca/toegang";
import { leesDocumentBestand } from "@/lib/horeca-personeel/documenten";
import { pdfAntwoord } from "@/lib/horeca-personeel/loonstroken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Een document downloaden, voor de beheerder van de zaak. De medewerker zelf gebruikt /api/personeel/documenten/[id].
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { tenantId } = await eisBeheer();
    const { id } = await ctx.params;
    const f = await leesDocumentBestand(tenantId, id);
    return pdfAntwoord(f.bytes, f.bestand);
  } catch (err) {
    const { status, body, headers } = toErrorBody(err);
    return NextResponse.json(body, { status, headers });
  }
}
