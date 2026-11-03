import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { jsonError } from "@/lib/http/errors";
import { eisBeheerder, eisZelfdeHerkomst } from "@/lib/voorstel/schwarzwald-accounts";
import { alleReviews, beoordeelReview, verwijderReview } from "@/lib/voorstel/schwarzwald-reviews";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Beoordelingen van gasten in het beheer: goedkeuren (dan staan ze op de
// site), verbergen, openbaar antwoorden of verwijderen.

export async function GET(): Promise<NextResponse> {
  try {
    await eisBeheerder();
    return NextResponse.json({ reviews: await alleReviews() });
  } catch (err) {
    return jsonError(err);
  }
}

const schema = z.object({
  id: z.string().max(40),
  status: z.enum(["nieuw", "goedgekeurd", "verborgen"]).optional(),
  antwoord: z.string().max(1500).optional(),
});

export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    await eisBeheerder();
    eisZelfdeHerkomst(request);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw AppError.validation("Ongeldige wijziging.");
    return NextResponse.json({ review: await beoordeelReview(parsed.data.id, { status: parsed.data.status, antwoord: parsed.data.antwoord }) });
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    await eisBeheerder();
    eisZelfdeHerkomst(request);
    const parsed = schema.pick({ id: true }).safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw AppError.validation("Onbekende beoordeling.");
    await verwijderReview(parsed.data.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
