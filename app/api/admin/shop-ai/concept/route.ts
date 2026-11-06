import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { maakConcept } from "@/lib/shop/winkel-ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

const schema = z.object({ idee: z.string().trim().min(3).max(1500), doelgroep: z.string().trim().max(100).optional(), inkoopEuro: z.number().min(0).max(10_000).optional() });

// POST /api/admin/shop-ai/concept — uit een idee een volledig productconcept met prijsvoorstel (slaat niets op).
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request) => {
  const d = schema.parse(await request.json());
  const uit = await maakConcept({ idee: d.idee, doelgroep: d.doelgroep, inkoopCents: d.inkoopEuro ? Math.round(d.inkoopEuro * 100) : undefined });
  return NextResponse.json(uit);
});
