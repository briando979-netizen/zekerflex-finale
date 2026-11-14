import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { enforceRateLimit } from "@/lib/rate-limit";
import { haalProductVanLink } from "@/lib/shop/link-product-server";
import { ideeUitLink, linkWaarschuwingen } from "@/lib/shop/link-product";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const schema = z.object({ url: z.string().trim().min(8).max(600) });

// POST /api/admin/shop-ai/link — de naam, omschrijving, foto en prijs van een productpagina lezen (slaat niets op).
// `waarschuwingen`: wat de eigenaar vóór het concept moet weten (minimale afname, een prijs die een inkoopprijs is).
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  await enforceRateLimit({ name: "shop-ai-link", identifier: principal.userId, limit: 40, windowSeconds: 3600, message: "Even rustig aan met links ophalen; probeer het zo opnieuw." });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw AppError.validation("Plak de hele link naar het product, beginnend met https://.");
  const p = await haalProductVanLink(parsed.data.url);
  return NextResponse.json({ ...p, idee: ideeUitLink(p), waarschuwingen: linkWaarschuwingen(p) });
});
