import { NextResponse } from "next/server";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { runAfter } from "@/lib/run-after";
import { annuleerTotMinVan } from "@/lib/afspraken/model";
import { stuurAnnulering } from "@/lib/afspraken/mail";
import { meldBedrijf } from "@/lib/afspraken/melding";
import { annuleerMetLink } from "@/lib/afspraken/store";
import { leesJson } from "@/lib/afspraken/toegang";
import { LINK_ONBEKEND_TEKST, annuleerUitleg } from "@/lib/afspraken/teksten";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/boeken/<slug>/afspraak: een klant annuleert zijn eigen afspraak met de geheime link uit zijn mail. De link staat
 * in de body (niet in een querystring, zodat hij in geen enkel log komt). Openbaar (valt onder /api/boeken), IP-begrensd,
 * met een verborgen botveld. Een onbekende, verkeerde of gewiste link geeft altijd dezelfde 404; een afspraak die al
 * geannuleerd, verstreken of te laat is geeft 409 met een uitleg. Het antwoord bevat nooit het id of de link.
 */
export async function POST(request: Request, ctx: { params: Promise<{ slug: string }> }): Promise<NextResponse> {
  try {
    await enforceRateLimit({ name: "boeken-annuleren", identifier: clientIp(request), limit: 20, windowSeconds: 3600, message: "Je hebt vaak geprobeerd te annuleren. Probeer het over een uur opnieuw of bel het bedrijf." });
    const { slug } = await ctx.params;
    const o = await leesJson(request);
    // een mens ziet dit veld niet; een bot vult het wel in. We doen alsof het gelukt is, zonder iets te doen.
    if (typeof o.website === "string" && o.website.trim()) return NextResponse.json({ geannuleerd: true });
    const uitslag = await annuleerMetLink(slug, typeof o.token === "string" ? o.token : "", new Date());
    if (uitslag.uitslag === "onbekend") throw AppError.notFound(LINK_ONBEKEND_TEKST);
    if (uitslag.uitslag === "geweigerd") {
      return NextResponse.json({ geannuleerd: false, reden: uitslag.reden, error: { code: "CONFLICT", message: annuleerUitleg(uitslag.reden, annuleerTotMinVan(uitslag.instellingen)) } }, { status: 409 });
    }
    // het bedrijf hoort het meteen, en de klant krijgt een bevestiging; na het antwoord, en een mislukte mail raakt het annuleren nooit
    runAfter(() => meldBedrijf(uitslag.tenantId, uitslag.afspraak, "geannuleerd"));
    runAfter(() => stuurAnnulering(uitslag.tenantId, uitslag.afspraak, uitslag.instellingen));
    return NextResponse.json({ geannuleerd: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
