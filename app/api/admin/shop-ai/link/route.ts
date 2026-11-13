import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { haalProductVanLink } from "@/lib/shop/link-product-server";
import { ideeUitLink } from "@/lib/shop/link-product";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const schema = z.object({ url: z.string().trim().min(8).max(600) });

// POST /api/admin/shop-ai/link — de naam, omschrijving, foto en prijs van een productpagina lezen (slaat niets op).
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request) => {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw AppError.validation("Plak de hele link naar het product, beginnend met https://.");
  const p = await haalProductVanLink(parsed.data.url);
  return NextResponse.json({ ...p, idee: ideeUitLink(p) });
});
