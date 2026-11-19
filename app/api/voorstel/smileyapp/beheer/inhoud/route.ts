import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { jsonBegrensd } from "@/lib/http/body-grens";
import { jsonError } from "@/lib/http/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { eisToegang } from "@/lib/voorstel/smileyapp-accounts";
import { bewaarBericht, eigenBerichten, verwijderBericht } from "@/lib/voorstel/smileyapp-blog";
import { smileyappCijfers } from "@/lib/voorstel/smileyapp-cijfers";
import { bewaarPosterZin, smileyappInstellingen, zetWeekmail } from "@/lib/voorstel/smileyapp-instellingen";
import { isPakketId } from "@/lib/voorstel/smileyapp-pakket-regels";
import { bewaarPakket, herstelPakketten, pakkettenVoorBeheer } from "@/lib/voorstel/smileyapp-pakketten";
import { beheerVan, smileyPoort } from "@/lib/voorstel/smileyapp-poort";
import { alleReviews, bewaarReview, verwijderReview } from "@/lib/voorstel/smileyapp-reviews";
import { vragenVoorBeheer, wijzigVragen } from "@/lib/voorstel/smileyapp-vragen";
import { stuurVoorbeeld } from "@/lib/voorstel/smileyapp-weekmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// De inhoud van de SmileyApp-site die het team zelf beheert, en de cijfers.
// GET ?deel=cijfers|blog|pakketten|reviews → de bezoekcijfers van 30 dagen, de eigen
//                                    blogberichten (ook concepten), de pakketten, of
//                                    de reviews (ook de verborgen)
// POST {actie}                     → blog-bewaren | blog-verwijderen |
//                                    review-bewaren | review-verwijderen |
//                                    pakket-bewaren | pakket-standaard
// Deel 6a: ?deel=vragen (de veelgestelde vragen) en ?deel=instellingen (de wekelijkse
// mail aan of uit, de zin op de poster), met de acties vraag-bewaren | vraag-verbergen |
// vraag-verplaatsen | vraag-verwijderen | vraag-standaard | weekmail-zetten |
// weekmail-voorbeeld | poster-bewaren. De vragen en de wekelijkse mail wijzigt alleen een
// beheerder (een medewerker leest mee); de zin op de poster mag het hele team aanpassen.
// Voor iedereen van het team (beheerder én medewerker) en een ZekerFlex-
// platformbeheerder. Elke methode: eigen site → limiet per IP → sessie. Niet
// ingelogd = 401. De regels staan in lib/voorstel/smileyapp-blog-regels.ts en
// smileyapp-pakket-regels.ts; de server controleert alles opnieuw.

export async function GET(request: Request): Promise<NextResponse> {
  try {
    await smileyPoort(request);
    await eisToegang();
    const deel = new URL(request.url).searchParams.get("deel");
    const geenCache = { headers: { "Cache-Control": "no-store" } };
    if (deel === "cijfers") return NextResponse.json({ cijfers: await smileyappCijfers(30) }, geenCache);
    if (deel === "blog") return NextResponse.json({ berichten: await eigenBerichten() }, geenCache);
    if (deel === "pakketten") return NextResponse.json(await pakkettenVoorBeheer(), geenCache);
    if (deel === "reviews") return NextResponse.json({ reviews: await alleReviews() }, geenCache);
    if (deel === "vragen") return NextResponse.json(await vragenVoorBeheer(), geenCache);
    if (deel === "instellingen") return NextResponse.json(await smileyappInstellingen(), geenCache);
    throw AppError.validation("Onbekend onderdeel.");
  } catch (err) {
    return jsonError(err);
  }
}

const ID = z.string().regex(/^[a-f0-9]{16}$/);
const PAKKET = z.string().max(20);
const VRAAG_ID = z.string().max(70);
const schema = z.discriminatedUnion("actie", [
  z.object({
    actie: z.literal("blog-bewaren"),
    id: ID.optional(),
    titel: z.string().max(400),
    datum: z.string().max(10),
    samenvatting: z.string().max(1000),
    tekst: z.string().max(40_000),
    status: z.string().max(20),
  }),
  z.object({ actie: z.literal("blog-verwijderen"), id: ID }),
  // ruime grenzen voor de vorm; de echte regels (lengtes, https, datum) staan in smileyapp-review-regels.ts
  z.object({
    actie: z.literal("review-bewaren"),
    id: ID.optional(),
    naam: z.string().max(200),
    organisatie: z.string().max(200),
    sterren: z.number(),
    tekst: z.string().max(2000),
    bron: z.string().max(20),
    bronLink: z.string().max(600),
    datum: z.string().max(10),
    zichtbaar: z.boolean(),
  }),
  z.object({ actie: z.literal("review-verwijderen"), id: ID }),
  z.object({ actie: z.literal("pakket-bewaren"), pakket: PAKKET, prijs: z.string().max(20), looptijd: z.string().max(10), label: z.string().max(100), onderdelen: z.string().max(4000) }),
  z.object({ actie: z.literal("pakket-standaard"), pakket: PAKKET.optional() }),
  // de veelgestelde vragen: ruime grenzen voor de vorm, de echte regels staan in smileyapp-vraag-regels.ts
  z.object({ actie: z.literal("vraag-bewaren"), id: VRAAG_ID.optional(), vraag: z.string().max(1000), antwoord: z.string().max(6000) }),
  z.object({ actie: z.literal("vraag-verbergen"), id: VRAAG_ID, verborgen: z.boolean() }),
  z.object({ actie: z.literal("vraag-verplaatsen"), id: VRAAG_ID, richting: z.enum(["op", "neer"]) }),
  z.object({ actie: z.literal("vraag-verwijderen"), id: VRAAG_ID }),
  z.object({ actie: z.literal("vraag-standaard"), id: VRAAG_ID.optional() }),
  z.object({ actie: z.literal("weekmail-zetten"), aan: z.boolean() }),
  z.object({ actie: z.literal("weekmail-voorbeeld") }),
  z.object({ actie: z.literal("poster-bewaren"), zin: z.string().max(400) }),
]);

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await smileyPoort(request, { json: true });
    const ik = await eisToegang();
    const gelezen = await jsonBegrensd(request, 60_000);
    const parsed = schema.safeParse(gelezen.ok ? gelezen.waarde : null);
    if (!parsed.success) throw AppError.validation("Controleer je gegevens.");
    const d = parsed.data;
    await enforceRateLimit({ name: "smileyapp-inhoud", identifier: ik.id, limit: 120, windowSeconds: 3600, message: "Je hebt dit uur al veel gewijzigd. Probeer het later opnieuw." });

    if (d.actie === "blog-bewaren") {
      const { actie: _actie, id, ...invoer } = d;
      return NextResponse.json({ bericht: await bewaarBericht(id, invoer, ik.naam) });
    }
    if (d.actie === "blog-verwijderen") {
      await verwijderBericht(d.id);
      return NextResponse.json({ ok: true });
    }
    // reviews: voor het hele team, net als de blog. Het scherm krijgt de hele lijst van de server terug.
    if (d.actie === "review-bewaren") {
      const { actie: _actie, id, ...invoer } = d;
      await bewaarReview(id, invoer, ik.naam);
      return NextResponse.json({ reviews: await alleReviews() });
    }
    if (d.actie === "review-verwijderen") {
      await verwijderReview(d.id);
      return NextResponse.json({ reviews: await alleReviews() });
    }
    // de zin op de poster: voor het hele team
    if (d.actie === "poster-bewaren") return NextResponse.json(await bewaarPosterZin(d.zin));

    // de veelgestelde vragen raken wat de site en de chat aan klanten vertellen: alleen een beheerder
    if (d.actie === "vraag-bewaren" || d.actie === "vraag-verbergen" || d.actie === "vraag-verplaatsen" || d.actie === "vraag-verwijderen" || d.actie === "vraag-standaard") {
      if (ik.rol !== "beheerder") throw AppError.alleenBeheerder("Alleen een beheerder kan de veelgestelde vragen wijzigen.");
      if (d.actie === "vraag-bewaren") return NextResponse.json(await wijzigVragen({ soort: "bewaren", id: d.id, vraag: d.vraag, antwoord: d.antwoord }));
      if (d.actie === "vraag-verbergen") return NextResponse.json(await wijzigVragen({ soort: "verbergen", id: d.id, verborgen: d.verborgen }));
      if (d.actie === "vraag-verplaatsen") return NextResponse.json(await wijzigVragen({ soort: "verplaatsen", id: d.id, richting: d.richting }));
      if (d.actie === "vraag-verwijderen") return NextResponse.json(await wijzigVragen({ soort: "verwijderen", id: d.id }));
      return NextResponse.json(await wijzigVragen({ soort: "standaard", id: d.id }));
    }

    // de wekelijkse mail: alleen een beheerder zet hem aan of uit, en een voorbeeld gaat alleen naar het eigen adres
    if (d.actie === "weekmail-zetten") {
      if (ik.rol !== "beheerder") throw AppError.alleenBeheerder("Alleen een beheerder kan de wekelijkse mail aan- of uitzetten.");
      return NextResponse.json(await zetWeekmail(d.aan));
    }
    if (d.actie === "weekmail-voorbeeld") {
      if (ik.rol !== "beheerder") throw AppError.alleenBeheerder("Alleen een beheerder krijgt de wekelijkse mail.");
      // via ZekerFlex binnen (platformbeheerder): er is geen SmileyApp-adres om naar te sturen
      if (ik.via !== "smileyapp" || !ik.email) throw AppError.validation("Een voorbeeld gaat naar het adres van je SmileyApp-account. Je bent nu via ZekerFlex ingelogd.");
      await enforceRateLimit({ name: "smileyapp-weekmail-voorbeeld", identifier: ik.id, limit: 3, windowSeconds: 3600, message: "Je hebt dit uur al drie voorbeelden gevraagd. Probeer het later opnieuw." });
      return NextResponse.json({ verstuurd: await stuurVoorbeeld(ik.email, beheerVan(request)) });
    }

    // prijzen en pakketten raken wat de site, de veelgestelde vragen en de chat aan klanten vertellen: alleen een beheerder
    if (ik.rol !== "beheerder") throw AppError.alleenBeheerder("Alleen een beheerder kan pakketten en prijzen wijzigen.");
    if (d.pakket !== undefined && !isPakketId(d.pakket)) throw AppError.validation("Dit pakket bestaat niet.");
    if (d.actie === "pakket-bewaren") {
      if (!isPakketId(d.pakket)) throw AppError.validation("Dit pakket bestaat niet.");
      await bewaarPakket(d.pakket, { prijs: d.prijs, looptijd: d.looptijd, label: d.label, onderdelen: d.onderdelen });
    } else {
      await herstelPakketten(d.pakket);
    }
    // de serverversie terug: het scherm neemt die over in plaats van zelf één veld bij te werken
    return NextResponse.json(await pakkettenVoorBeheer());
  } catch (err) {
    return jsonError(err);
  }
}
