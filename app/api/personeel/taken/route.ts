import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, toErrorBody } from "@/lib/errors";
import { zelfdeHerkomst } from "@/lib/rijschool/herkomst";
import { enforceRateLimit } from "@/lib/rate-limit";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { lijstenOp, vinkAf, vinkUit } from "@/lib/horeca/takenlijsten";
import { medewerkerContext } from "@/lib/horeca-personeel/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// De takenlijsten van vandaag voor een medewerker van de zaak (app/personeel): lezen en afvinken. Alleen als het dashboard van
// de medewerker het onderdeel "taken" heeft. De datum bepaalt de server (Amsterdamse dag), niet de telefoon.

const fout = (err: unknown) => {
  const { status, body, headers } = toErrorBody(err);
  return NextResponse.json(body, { status, headers });
};

async function eisTaken() {
  const c = await medewerkerContext();
  if (!c) throw AppError.unauthenticated();
  if (!c.dashboard.blokken.includes("taken")) throw AppError.forbidden("Dit onderdeel staat niet op jouw dashboard.");
  return c;
}

const actieSchema = z.discriminatedUnion("actie", [
  z.object({ actie: z.literal("af"), lijstId: z.string().min(1).max(40), taak: z.number().int().min(0).max(39), waarde: z.string().max(20).default("") }),
  z.object({ actie: z.literal("terug"), lijstId: z.string().min(1).max(40), taak: z.number().int().min(0).max(39) }),
]);

export async function GET(): Promise<NextResponse> {
  try {
    const c = await eisTaken();
    return NextResponse.json({ lijsten: await lijstenOp(c.zaak.id, amsterdamDayKey(new Date())) });
  } catch (err) {
    return fout(err);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    if (!zelfdeHerkomst(request.headers, request.url)) throw AppError.forbidden("Verzoek van een andere website geweigerd.");
    const c = await eisTaken();
    await enforceRateLimit({ name: "personeel-taken", identifier: c.userId, limit: 300, windowSeconds: 3600 });
    const parsed = actieSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw AppError.validation("Dit verzoek klopt niet.");
    const a = parsed.data;
    const datum = amsterdamDayKey(new Date());
    let binnenGrens: boolean | null = null;
    if (a.actie === "af") ({ binnenGrens } = await vinkAf(c.zaak, { lijstId: a.lijstId, datum, taak: a.taak, waarde: a.waarde, door: c.naam }));
    else await vinkUit(c.zaak, { lijstId: a.lijstId, datum, taak: a.taak });
    return NextResponse.json({ lijsten: await lijstenOp(c.zaak.id, datum), binnenGrens });
  } catch (err) {
    return fout(err);
  }
}
