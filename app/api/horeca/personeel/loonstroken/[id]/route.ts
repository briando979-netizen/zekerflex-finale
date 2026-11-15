import { NextResponse } from "next/server";
import { toErrorBody } from "@/lib/errors";
import { eisBeheer } from "@/lib/horeca/toegang";
import { leesLoonstrookBestand, pdfAntwoord } from "@/lib/horeca-personeel/loonstroken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Een loonstrook downloaden, voor de beheerder van de zaak. De medewerker zelf gebruikt /api/personeel/loonstroken/[id].
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { tenantId } = await eisBeheer();
    const { id } = await ctx.params;
    const f = await leesLoonstrookBestand(tenantId, id);
    return pdfAntwoord(f.bytes, f.bestand);
  } catch (err) {
    const { status, body, headers } = toErrorBody(err);
    return NextResponse.json(body, { status, headers });
  }
}
