import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { zelfdeHerkomst } from "@/lib/rijschool/herkomst";
import { medewerkerContext } from "@/lib/horeca-personeel/context";
import { markeerGelezen } from "@/lib/horeca-personeel/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Een medewerker meldt welke mededelingen hij op zijn scherm heeft gehad; de beheerder ziet "gelezen door x van y". Alleen voor
// de eigen medewerker (uit de sessie) en alleen mededelingen die bij zijn dashboard horen.
const schema = z.object({ ids: z.array(z.string().min(1).max(40)).max(30) });

export async function POST(request: Request): Promise<NextResponse> {
  try {
    if (!zelfdeHerkomst(request.headers, request.url)) throw AppError.forbidden("Verzoek van een andere website geweigerd.");
    const c = await medewerkerContext();
    if (!c) throw AppError.unauthenticated();
    await enforceRateLimit({ name: "personeel-gelezen", identifier: c.userId, limit: 120, windowSeconds: 3600 });
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw AppError.validation("Dit verzoek klopt niet.");
    const zichtbaar = new Set(c.mededelingen.map((m) => m.id));
    await markeerGelezen(c.tenantId, c.medewerker.id, parsed.data.ids.filter((id) => zichtbaar.has(id)));
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body, headers } = toErrorBody(err);
    return NextResponse.json(body, { status, headers });
  }
}
