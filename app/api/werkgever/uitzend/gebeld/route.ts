import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { bureauContext, isEigenAanvraag, zetGebeld } from "@/lib/uitzend/bureau";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ offerId: z.string().min(4).max(40), gebeld: z.boolean() });

// POST /api/werkgever/uitzend/gebeld — een uitzendpartner zet bij een aanvraag dat hij de werker belde (of haalt dat weg).
// Alleen voor een aanvraag op een eigen klus; de stand staat bij het bureau (lib/uitzend/bureau.ts), niet bij de werker.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const ctx = await bureauContext();
    requireRole(ctx.principal, "LOCAL_MANAGER", "HQ_ADMIN", "PLATFORM_ADMIN");
    if (!ctx.tenantId || !ctx.partnerSinds) throw AppError.precondition("Dit kan alleen bij een uitzendpartner.");
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) throw AppError.validation("Onbekende aanvraag");
    if (!(await isEigenAanvraag(ctx, parsed.data.offerId))) throw AppError.notFound("Aanvraag niet gevonden.");
    const stand = await zetGebeld(ctx.tenantId, parsed.data.offerId, parsed.data.gebeld);
    return NextResponse.json({ gebeld: Object.hasOwn(stand.gebeld, parsed.data.offerId) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
