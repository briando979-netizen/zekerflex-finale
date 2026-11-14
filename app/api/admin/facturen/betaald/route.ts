import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { meldBetaaldPerOverschrijving } from "@/lib/billing/overschrijving-betaald";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ nummer: z.string().trim().min(3).max(40) });

// POST /api/admin/facturen/betaald { nummer } — het geld van deze factuur staat op de rekening (bankoverschrijving); de
// factuur gaat op betaald. Alleen de platformbeheerder, alleen een open factuur voor platformkosten
// (lib/billing/overschrijving-betaald-kern.ts).
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request: Request, { principal }) => {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw AppError.validation("Vul het factuurnummer in zoals het op de factuur staat.");
  const factuur = await meldBetaaldPerOverschrijving(parsed.data.nummer, principal.userId);
  return NextResponse.json({ ok: true, factuur });
});
