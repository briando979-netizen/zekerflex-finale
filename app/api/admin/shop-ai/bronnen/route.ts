import { NextResponse } from "next/server";
import { withAdminAccess } from "@/lib/auth/handlers";
import { leesLinkBronnen } from "@/lib/shop/link-product-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET: waar de conceptproducten vandaan komen (pagina en foto van de leverancier), per product-id, voor Beheer -> Webshop.
// Alleen host en pad: de querystring kan een token zijn en gaat nooit naar de browser.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  return NextResponse.json({ bronnen: await leesLinkBronnen() });
});