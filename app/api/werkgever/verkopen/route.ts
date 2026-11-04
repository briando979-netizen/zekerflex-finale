import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { siteTenantOf } from "@/lib/sites/access";
import { geefAkkoord, verkoperBestellingen, verkoperProductDto, verkoperProducten, verkoperStand } from "@/lib/shop/verkoper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/werkgever/verkopen — Studio → Verkopen: de stand van het bedrijf als
// verkoper op de ZekerFlex-marktplaats, zijn producten en zijn verkopen.
export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const tenantId = await siteTenantOf(p);
    const [stand, producten, verkopen] = await Promise.all([verkoperStand(tenantId), verkoperProducten(tenantId), verkoperBestellingen(tenantId)]);
    return NextResponse.json({ stand, producten: producten.map(verkoperProductDto), verkopen });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

const akkoordSchema = z.object({ akkoord: z.literal(true) });

// POST /api/werkgever/verkopen { akkoord: true } — akkoord op de verkoopvoorwaarden.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const tenantId = await siteTenantOf(p);
    if (!akkoordSchema.safeParse(await request.json().catch(() => ({}))).success) throw AppError.validation("Vink aan dat je akkoord gaat met de verkoopvoorwaarden.");
    const akkoord = await geefAkkoord(tenantId, p.userId);
    await recordAudit({
      category: "ADMIN",
      action: "shop.verkoper.akkoord",
      actorUserId: p.userId,
      summary: `Akkoord op de verkoopvoorwaarden van de ZekerFlex-marktplaats (versie ${akkoord.versie})`,
      targetType: "tenant",
      targetId: tenantId,
    });
    return NextResponse.json({ stand: await verkoperStand(tenantId) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
