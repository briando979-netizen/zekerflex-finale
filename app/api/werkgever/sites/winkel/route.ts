import { after, NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { siteTenantOf } from "@/lib/sites/access";
import { winkelDeelSchema, winkelSchema } from "@/lib/sites/schema";
import { saveWinkel, winkelSiteOf } from "@/lib/sites/store";
import { LEGE_WINKEL } from "@/lib/sites/types";
import { verdwenenProducten, weerBestelbaar } from "@/lib/sites/voorraadmelding";
import { stuurVoorraadMeldingen, wisWachtlijsten } from "@/lib/sites/voorraadmelding-opslag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PUT /api/werkgever/sites/winkel { winkel } — Websitestudio → Producten en Instellingen:
// alleen de winkel, en die staat meteen live (lib/sites/store.ts liveSiteOf); de pagina's wachten op Publiceren.
// Is een uitverkocht product weer te bestellen, dan krijgt wie erop wachtte na het antwoord één mail
// (lib/sites/voorraadmelding-opslag.ts); gaat een product weg, dan ook zijn wachtlijst.
export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const site = await winkelSiteOf(await siteTenantOf(p));
    if (!site) throw AppError.notFound("Maak eerst een website.");
    const { winkel } = z.object({ winkel: winkelSchema }).parse(await request.json().catch(() => ({})));
    const saved = await saveWinkel(site.id, winkel);
    const voor = site.winkel ?? LEGE_WINKEL;
    const terug = weerBestelbaar(voor, winkel);
    const weg = verdwenenProducten(voor, winkel);
    if (terug.length || weg.length) {
      after(async () => {
        await wisWachtlijsten(saved.id, weg).catch((err) => logger.warn("back-in-stock list not cleared", { siteId: saved.id, err: String(err) }));
        await stuurVoorraadMeldingen(saved, terug).catch((err) => logger.warn("back-in-stock mails failed", { siteId: saved.id, err: String(err) }));
      });
    }
    return NextResponse.json({ site: saved });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// PATCH /api/werkgever/sites/winkel { deel } — Webshop → Kortingen, Verzending, Betalen en Instellingen:
// alleen die instellingen, samengevoegd met de winkel zoals hij nu is (de producten en hun voorraad blijven
// van de server), daarna de hele winkel gecontroleerd. Meteen live, net als PUT.
export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const site = await winkelSiteOf(await siteTenantOf(p));
    if (!site) throw AppError.notFound("Maak eerst een webshop.");
    const { deel } = z.object({ deel: winkelDeelSchema }).parse(await request.json().catch(() => ({})));
    const { btw, betalen, ...rest } = deel;
    const samen: Record<string, unknown> = { ...(site.winkel ?? LEGE_WINKEL), ...rest };
    // null haalt de instelling weg (geen btw-regels, of alleen de betaaltekst zoals vroeger)
    if (btw === null) delete samen.btw;
    else if (btw) samen.btw = btw;
    if (betalen === null) delete samen.betalen;
    else if (betalen) samen.betalen = betalen;
    const gecontroleerd = winkelSchema.safeParse(samen);
    // de zin van de eerste fout, zodat de studio precies zegt wat er niet klopt
    if (!gecontroleerd.success) throw AppError.validation(gecontroleerd.error.issues[0]?.message ?? "Niet alle gegevens zijn goed ingevuld.");
    const saved = await saveWinkel(site.id, gecontroleerd.data);
    return NextResponse.json({ site: saved });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
