import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { featureEnabled } from "@/lib/flags";
import { kluisVoorWerker, onthulGeheim, werkerMagZien } from "@/lib/locatie/kluis";
import { locatieStand } from "@/lib/locatie/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// De sleutelkluis voor een werker (lib/locatie/kluis.ts): wat hij nu mag zien
// bij zijn diensten, en één geheim onthullen (met een regel in het logboek).
//   GET                          → { diensten: DienstMetKluis[] }
//   POST { tenantId, itemId }    → { geheim, item }

const schema = z.object({ tenantId: z.string().min(1).max(64), itemId: z.string().min(1).max(40) });

export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    if (!(await featureEnabled("locatie-modules", { userId: p.userId }))) return NextResponse.json({ diensten: [], uit: true });
    const alles = await kluisVoorWerker(p.userId);
    const diensten = [];
    for (const d of alles) if ((await locatieStand(d.tenantId)).modules.kluis?.aan) diensten.push(d);
    return NextResponse.json({ diensten });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const input = schema.parse(await request.json().catch(() => ({})));
    if (!(await locatieStand(input.tenantId)).modules.kluis?.aan) throw AppError.forbidden("De sleutelkluis van dit bedrijf staat uit.");
    const via = await werkerMagZien(p.userId, input.tenantId, input.itemId);
    if (!via) throw AppError.forbidden("Dit staat nu niet voor je open. Je ziet codes vanaf twee uur vóór je dienst tot het einde ervan.");
    const { item, geheim } = await onthulGeheim(input.tenantId, input.itemId, { userId: p.userId, naam: p.fullName, rol: "werker", shiftId: via.shiftId });
    return NextResponse.json({ item, geheim });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
