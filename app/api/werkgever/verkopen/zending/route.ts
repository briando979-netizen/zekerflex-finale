import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { enforceRateLimit } from "@/lib/rate-limit";
import { siteTenantOf } from "@/lib/sites/access";
import { markeerVerzonden } from "@/lib/shop/verkoper";
import { VERVOERDERS, isTrackCode } from "@/lib/shop/verkoper-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  orderId: z.string().trim().min(10).max(40),
  vervoerder: z.enum(VERVOERDERS),
  code: z.string().trim().max(40),
});

// POST /api/werkgever/verkopen/zending { orderId, vervoerder, code } — de verkoper
// heeft zijn deel verstuurd; de koper krijgt de track-en-trace per mail.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    await enforceRateLimit({ name: "verkoper-zending", identifier: p.userId, limit: 120, windowSeconds: 3600, message: "Even rustig aan; probeer het zo opnieuw." });
    const tenantId = await siteTenantOf(p);
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) throw AppError.validation("Kies de vervoerder en vul de track-en-tracecode in.");
    if (!isTrackCode(parsed.data.code)) throw AppError.validation("Deze track-en-tracecode klopt niet. Gebruik alleen letters, cijfers en streepjes (6 tot 40 tekens).");
    const zending = await markeerVerzonden(tenantId, parsed.data.orderId, parsed.data.vervoerder, parsed.data.code);
    await recordAudit({
      category: "ADMIN",
      action: "shop.verkoper.verzonden",
      actorUserId: p.userId,
      summary: `Verkoper verstuurde zijn deel van bestelling ${parsed.data.orderId} (${parsed.data.vervoerder})`,
      targetType: "shop-order",
      targetId: parsed.data.orderId,
      metadata: { tenantId },
    });
    return NextResponse.json({ zending });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
