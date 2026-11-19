import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { jsonBegrensd } from "@/lib/http/body-grens";
import { jsonError } from "@/lib/http/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { eisToegang } from "@/lib/voorstel/smileyapp-accounts";
import { bewaarBericht, eigenBerichten, verwijderBericht } from "@/lib/voorstel/smileyapp-blog";
import { smileyappCijfers } from "@/lib/voorstel/smileyapp-cijfers";
import { isPakketId } from "@/lib/voorstel/smileyapp-pakket-regels";
import { bewaarPakket, herstelPakketten, pakkettenVoorBeheer } from "@/lib/voorstel/smileyapp-pakketten";
import { smileyPoort } from "@/lib/voorstel/smileyapp-poort";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// De inhoud van de SmileyApp-site die het team zelf beheert, en de cijfers.
// GET ?deel=cijfers|blog|pakketten → de bezoekcijfers van 30 dagen, de eigen
//                                    blogberichten (ook concepten), of de pakketten
// POST {actie}                     → blog-bewaren | blog-verwijderen |
//                                    pakket-bewaren | pakket-standaard
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
    throw AppError.validation("Onbekend onderdeel.");
  } catch (err) {
    return jsonError(err);
  }
}

const ID = z.string().regex(/^[a-f0-9]{16}$/);
const PAKKET = z.string().max(20);
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
  z.object({ actie: z.literal("pakket-bewaren"), pakket: PAKKET, prijs: z.string().max(20), looptijd: z.string().max(10), label: z.string().max(100), onderdelen: z.string().max(4000) }),
  z.object({ actie: z.literal("pakket-standaard"), pakket: PAKKET.optional() }),
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
