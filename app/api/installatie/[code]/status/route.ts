import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, toErrorBody } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { GEEN_CACHE, laadViaCode, maakMonteurBeeld } from "@/lib/installatie/api";
import { STATUSSEN } from "@/lib/installatie/model";
import { zetStatus } from "@/lib/installatie/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ naar: z.enum(STATUSSEN) });

/** POST /api/installatie/<code>/status { naar }: alleen met de monteurlink, en alleen de toegestane volgende stap. */
export async function POST(request: Request, ctx: { params: Promise<{ code: string }> }): Promise<NextResponse> {
  try {
    const { code } = await ctx.params;
    const { afspraak, rol } = await laadViaCode(code, request, "schrijven");
    if (rol !== "monteur") throw AppError.notFound("Deze link klopt niet of is verlopen.");
    const json: unknown = await request.json().catch(() => {
      throw AppError.validation("Het verzoek kwam niet goed aan. Ververs de pagina en probeer het opnieuw.");
    });
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw AppError.validation("Deze stap bestaat niet.");
    const bijgewerkt = await zetStatus(afspraak.id, parsed.data.naar);
    // alleen het id en de nieuwe stap, nooit de code of een positie
    logger.info("installatie status", { id: afspraak.id, naar: bijgewerkt.status });
    return NextResponse.json({ beeld: maakMonteurBeeld(bijgewerkt, new Date()) }, { headers: GEEN_CACHE });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status, headers: GEEN_CACHE });
  }
}
