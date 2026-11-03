import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { jsonError } from "@/lib/http/errors";
import { eisBeheerder, eisZelfdeHerkomst } from "@/lib/voorstel/schwarzwald-accounts";
import { alleSollicitaties, verwijderSollicitatie, wijzigSollicitatie } from "@/lib/voorstel/schwarzwald-sollicitaties";
import { SOLLICITATIE_STATUS } from "@/lib/voorstel/sollicitatie-regels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sollicitaties in het beheer: status bijhouden (nieuw → gesprek →
// aangenomen/afgewezen), een interne notitie, of meteen verwijderen.

export async function GET(): Promise<NextResponse> {
  try {
    await eisBeheerder();
    return NextResponse.json({ sollicitaties: await alleSollicitaties() });
  } catch (err) {
    return jsonError(err);
  }
}

const schema = z.object({
  id: z.string().max(40),
  status: z.enum(SOLLICITATIE_STATUS).optional(),
  notitie: z.string().max(2000).optional(),
});

export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    await eisBeheerder();
    eisZelfdeHerkomst(request);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw AppError.validation("Ongeldige wijziging.");
    return NextResponse.json({ sollicitatie: await wijzigSollicitatie(parsed.data.id, { status: parsed.data.status, notitie: parsed.data.notitie }) });
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    await eisBeheerder();
    eisZelfdeHerkomst(request);
    const parsed = schema.pick({ id: true }).safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw AppError.validation("Onbekende sollicitatie.");
    await verwijderSollicitatie(parsed.data.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
