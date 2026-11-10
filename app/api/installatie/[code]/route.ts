import { NextResponse } from "next/server";
import { toErrorBody } from "@/lib/errors";
import { GEEN_CACHE, laadViaCode, maakMonteurBeeld } from "@/lib/installatie/api";
import { maakKlantBeeld } from "@/lib/installatie/model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/installatie/<code>: de stand van een installatieafspraak, voor de klant (kijken) of de
 * monteur (met de knoppen). Openbaar: de code in het adres is de sleutel. Nooit de code loggen.
 */
export async function GET(request: Request, ctx: { params: Promise<{ code: string }> }): Promise<NextResponse> {
  try {
    const { code } = await ctx.params;
    const { afspraak, rol } = await laadViaCode(code, request, "lezen");
    const nu = new Date();
    const beeld = rol === "monteur" ? maakMonteurBeeld(afspraak, nu) : maakKlantBeeld(afspraak, nu);
    return NextResponse.json({ rol, beeld }, { headers: GEEN_CACHE });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status, headers: GEEN_CACHE });
  }
}
