import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { siteTenantOf } from "@/lib/sites/access";
import { siteAdres } from "@/lib/sites/adres";
import { bestellingenVan } from "@/lib/sites/bestellingen";
import { bestellingenCsv, csvNaam, productenCsv } from "@/lib/sites/export-csv";
import { klantenCsv, klantenUit } from "@/lib/sites/klanten";
import { alleReserveringen } from "@/lib/sites/reserveringen-opslag";
import { winkelSiteOf } from "@/lib/sites/store";
import type { SiteDoc } from "@/lib/sites/types";
import { winkelVan } from "@/lib/sites/winkel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/werkgever/sites/export/bestellingen | klanten | producten — Studio → Webshop → Groei → Exporteren:
// alles van de eigen webshop als CSV voor Excel (lib/sites/export-csv.ts). Alleen voor het eigen bedrijf.

const EXPORTS = {
  bestellingen: async (site: SiteDoc) => bestellingenCsv(await bestellingenVan(site.id, 3000)),
  klanten: async (site: SiteDoc) => {
    const [bestellingen, reserveringen] = await Promise.all([bestellingenVan(site.id, 3000), alleReserveringen(site.id)]);
    return klantenCsv(klantenUit(bestellingen, reserveringen));
  },
  producten: async (site: SiteDoc) => productenCsv(winkelVan(site), (await siteAdres(site)).adres),
};

export async function GET(_request: Request, { params }: { params: Promise<{ wat: string }> }): Promise<NextResponse> {
  try {
    const { wat } = await params;
    if (!Object.hasOwn(EXPORTS, wat)) throw AppError.notFound("Deze export bestaat niet.");
    const soort = wat as keyof typeof EXPORTS;
    const p = await requirePrincipal();
    const site = await winkelSiteOf(await siteTenantOf(p));
    if (!site) throw AppError.notFound("Maak eerst een webshop.");
    const csv = await EXPORTS[soort](site);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${csvNaam(soort, new Date())}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
