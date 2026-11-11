import { NextResponse } from "next/server";
import { AppError, toErrorBody } from "@/lib/errors";
import { AFSPRAAK_ID, isStatus } from "@/lib/afspraken/model";
import { zetStatus } from "@/lib/afspraken/store";
import { eigenOrganisatie, leesJson } from "@/lib/afspraken/toegang";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PATCH /api/werkgever/afspraken/<id>: de status van een afspraak zetten (bevestigd, geweest, niet gekomen, geannuleerd). */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const { tenantId } = await eigenOrganisatie();
    const { id } = await ctx.params;
    if (!AFSPRAAK_ID.test(id)) throw AppError.notFound("Deze afspraak bestaat niet (meer).");
    const { status } = await leesJson(request);
    if (!isStatus(status)) throw AppError.validation("Kies een status uit de lijst.");
    return NextResponse.json({ afspraak: await zetStatus(tenantId, id, status) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
