import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { siteTenantOf } from "@/lib/sites/access";
import { siteAdres } from "@/lib/sites/adres";
import type { GroeiStand, WachtToestand } from "@/lib/sites/groei";
import { FEED_PAD, heeftFeed, productFeed } from "@/lib/sites/productfeed";
import { liveSiteOf, winkelSiteOf } from "@/lib/sites/store";
import type { SiteDoc } from "@/lib/sites/types";
import { bestelbaar } from "@/lib/sites/voorraadmelding";
import { isUitverkocht } from "@/lib/sites/winkel";
import { stuurVoorraadMeldingen, wachtlijstVan } from "@/lib/sites/voorraadmelding-opslag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Studio → Webshop → Groei: de productfeed voor Google (adres en wat erin staat, lib/sites/productfeed.ts)
// en de wachtlijsten "mail me als het er weer is" (lib/sites/voorraadmelding-opslag.ts): alleen aantallen,
// nooit een e-mailadres. POST { actie: "mail", productId } mailt een wachtlijst alsnog (een product dat
// weer op voorraad kwam toen de webshop nog niet online stond).

async function stand(site: SiteDoc): Promise<GroeiStand> {
  const [plek, live, telling] = await Promise.all([siteAdres(site), liveSiteOf(site), wachtlijstVan(site.id)]);
  // de feed zoals Google hem ziet: de gepubliceerde site met de winkel van nu
  const bron = live?.snapshot ?? site;
  const feed = productFeed(bron, plek);
  const producten = site.winkel?.producten ?? [];
  return {
    gepubliceerd: Boolean(live),
    eigenDomein: plek.eigenDomein,
    adres: plek.adres,
    feed: { url: live && heeftFeed(bron) ? `${plek.adres}/${FEED_PAD}` : null, inFeed: feed.inFeed, zonderFoto: feed.zonderFoto, zonderPrijs: feed.zonderPrijs },
    wachtlijst: [...telling]
      .map(([productId, aantal]) => {
        const p = producten.find((x) => x.id === productId);
        const toestand: WachtToestand = !p ? "weg" : bestelbaar(p) ? "te-bestellen" : isUitverkocht(p) ? "uitverkocht" : "verborgen";
        return { productId, naam: p?.naam ?? "Verwijderd product", aantal, toestand };
      })
      .sort((a, b) => b.aantal - a.aantal || a.naam.localeCompare(b.naam, "nl")),
  };
}

export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const site = await winkelSiteOf(await siteTenantOf(p));
    if (!site) throw AppError.notFound("Maak eerst een webshop.");
    return NextResponse.json(await stand(site));
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

const mailSchema = z.object({ actie: z.literal("mail"), productId: z.string().regex(/^p[a-z0-9]{6,20}$/) });

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const site = await winkelSiteOf(await siteTenantOf(p));
    if (!site) throw AppError.notFound("Maak eerst een webshop.");
    const { productId } = mailSchema.parse(await request.json().catch(() => ({})));
    const product = site.winkel?.producten.find((x) => x.id === productId);
    if (!product) throw AppError.notFound("Dit product bestaat niet (meer).");
    if (!bestelbaar(product)) throw AppError.validation("Dit product is nog uitverkocht of verborgen. Zet eerst de voorraad hoger dan 0.");
    if (!site.liveBuild) throw AppError.validation("Publiceer je webshop eerst: anders werkt de link in de mail nog niet.");
    const { verstuurd } = await stuurVoorraadMeldingen(site, [productId]);
    return NextResponse.json({ verstuurd, stand: await stand(site) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
