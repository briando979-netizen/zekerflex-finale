import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { telPartnerKlik, tenantVanCode } from "@/lib/shop/partner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /shop/p/<partnercode>?naar=<productslug> — de partnerlink van een bedrijf.
// Telt de klik (alleen een getal per dag, niets over de bezoeker) en stuurt door
// naar de shop of het product, met ?partner=<code> erbij; de shop onthoudt dat in
// het tabblad en geeft het mee aan de bestelling. Het doel is altijd een eigen
// /shop-pad (geen open redirect), en altijd via APP_BASE_URL: achter Caddy is
// request.url het interne app:3000.
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram/i;

export async function GET(request: Request, ctx: { params: Promise<{ code: string }> }): Promise<NextResponse> {
  const { code } = await ctx.params;
  const naar = new URL(request.url).searchParams.get("naar");
  const slug = naar && /^[a-z0-9][a-z0-9-]{0,119}$/.test(naar) ? naar : null;
  const target = new URL(slug ? `/shop/${slug}` : "/shop", env.APP_BASE_URL);
  const tenantId = await tenantVanCode(code).catch(() => null);
  if (tenantId) {
    target.searchParams.set("partner", code);
    if (!BOT.test(request.headers.get("user-agent") ?? "")) await telPartnerKlik(tenantId, slug);
  }
  const res = NextResponse.redirect(target, 302);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("X-Robots-Tag", "noindex");
  return res;
}
