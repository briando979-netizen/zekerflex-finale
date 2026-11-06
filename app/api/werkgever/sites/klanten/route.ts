import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { siteTenantOf } from "@/lib/sites/access";
import { bestellingenVan } from "@/lib/sites/bestellingen";
import { klantenUit } from "@/lib/sites/klanten";
import { alleReserveringen } from "@/lib/sites/reserveringen-opslag";
import { winkelSiteOf } from "@/lib/sites/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Websitestudio → Klanten: iedereen die via de eigen website bestelde of reserveerde (lib/sites/klanten.ts).
// Alleen voor het eigen bedrijf; er komt niets bij wat niet al in de bestellingen en reserveringen stond.

export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const site = await winkelSiteOf(await siteTenantOf(p));
    if (!site) return NextResponse.json({ klanten: [] });
    const [bestellingen, reserveringen] = await Promise.all([bestellingenVan(site.id, 3000), alleReserveringen(site.id)]);
    return NextResponse.json({ klanten: klantenUit(bestellingen, reserveringen) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
