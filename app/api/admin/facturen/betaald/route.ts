import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { bedragNaarCents } from "@/lib/billing/overschrijving-betaald-kern";
import { bekijkTeBetalen, meldBetaaldPerOverschrijving } from "@/lib/billing/overschrijving-betaald";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ actie: z.enum(["bekijk", "zet"]), nummer: z.string().trim().min(3).max(40), bedrag: z.string().max(30).optional() });

// POST /api/admin/facturen/betaald — een factuur die per bankoverschrijving is betaald op betaald zetten. Alleen de
// platformbeheerder, alleen een open factuur voor platformkosten (lib/billing/overschrijving-betaald-kern.ts).
//   { actie: "bekijk", nummer }          → welke factuur, van welk bedrijf, welk bedrag (schrijft niets)
//   { actie: "zet", nummer, bedrag }     → op betaald, alleen als het ontvangen bedrag precies het factuurbedrag is
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request: Request, { principal }) => {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw AppError.validation("Vul het factuurnummer in zoals het op de factuur staat.");
  const d = parsed.data;
  if (d.actie === "bekijk") return NextResponse.json({ factuur: await bekijkTeBetalen(d.nummer) });
  const factuur = await meldBetaaldPerOverschrijving(d.nummer, bedragNaarCents(d.bedrag), principal.userId);
  return NextResponse.json({ ok: true, factuur });
});
