import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { jsonError } from "@/lib/http/errors";
import { eisBeheerder, eisZelfdeHerkomst } from "@/lib/voorstel/schwarzwald-accounts";
import { alleAanvragen, verwijderAanvraag, wijzigAanvraag } from "@/lib/voorstel/schwarzwald-crm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Aanvragen (leads) in het beheer: pijplijn nieuw → in behandeling → offerte →
// geboekt/verloren, met offertebedrag.

export async function GET(): Promise<NextResponse> {
  try {
    await eisBeheerder();
    return NextResponse.json({ aanvragen: await alleAanvragen() });
  } catch (err) {
    return jsonError(err);
  }
}

const schema = z.object({
  id: z.string().max(40),
  status: z.enum(["nieuw", "in-behandeling", "offerte", "geboekt", "verloren"]).optional(),
  bedrag: z.number().min(0).max(1_000_000).nullable().optional(),
});

export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    await eisBeheerder();
    eisZelfdeHerkomst(request);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw AppError.validation("Ongeldige wijziging.");
    return NextResponse.json({ aanvraag: await wijzigAanvraag(parsed.data.id, { status: parsed.data.status, bedrag: parsed.data.bedrag }) });
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    await eisBeheerder();
    eisZelfdeHerkomst(request);
    const parsed = schema.pick({ id: true }).safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw AppError.validation("Onbekende aanvraag.");
    await verwijderAanvraag(parsed.data.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
