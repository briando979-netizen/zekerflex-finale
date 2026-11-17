import { NextResponse } from "next/server";
import { withAdminAccess } from "@/lib/auth/handlers";
import { oudAssortimentUit } from "@/lib/shop/cj/importeer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/shop-ai/cj/oud-uit — het oude assortiment uitzetten (alles wat aan staat, niet van CJ
// komt en niet van een verkoper is). Niets wordt gewist: in Beheer → Webshop zet je een product zo weer aan.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (_request, { principal }) => {
  const aantal = await oudAssortimentUit(principal.userId);
  return NextResponse.json({ aantal });
});
