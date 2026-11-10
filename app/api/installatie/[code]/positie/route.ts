import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, toErrorBody } from "@/lib/errors";
import { GEEN_CACHE, laadViaCode, maakMonteurBeeld } from "@/lib/installatie/api";
import { zetPositie } from "@/lib/installatie/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180), nauwkeurigheid: z.number().min(0).max(100_000).optional() });

/**
 * POST /api/installatie/<code>/positie { lat, lon, nauwkeurigheid? }: de telefoon van de monteur meldt waar
 * hij is, alleen onderweg. De positie wordt nergens gelogd en verdwijnt zodra hij er is.
 */
export async function POST(request: Request, ctx: { params: Promise<{ code: string }> }): Promise<NextResponse> {
  try {
    const { code } = await ctx.params;
    const { afspraak, rol } = await laadViaCode(code, request, "schrijven");
    if (rol !== "monteur") throw AppError.notFound("Deze link klopt niet of is verlopen.");
    const json: unknown = await request.json().catch(() => {
      throw AppError.validation("Het verzoek kwam niet goed aan.");
    });
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw AppError.validation("Deze plek klopt niet.");
    const bijgewerkt = await zetPositie(afspraak.id, parsed.data);
    return NextResponse.json({ beeld: maakMonteurBeeld(bijgewerkt, new Date()) }, { headers: GEEN_CACHE });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status, headers: GEEN_CACHE });
  }
}
