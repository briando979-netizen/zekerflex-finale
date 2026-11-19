import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { jsonBegrensd } from "@/lib/http/body-grens";
import { jsonError } from "@/lib/http/errors";
import { lijst } from "@/lib/http/zod-lijst";
import { enforceRateLimit } from "@/lib/rate-limit";
import { CONTACT } from "@/lib/voorstel/smileyapp";
import { TIJD_BEZET, valideerAanvraag, type Afspraak } from "@/lib/voorstel/smileyapp-aanvraag-regels";
import { maakAanvraag, nieuwAanvraagId } from "@/lib/voorstel/smileyapp-aanvragen";
import { beheerderAdressen } from "@/lib/voorstel/smileyapp-accounts";
import { afspraakInTaal, afsprakenVoorSite, boekTijd, geefTijdVrij } from "@/lib/voorstel/smileyapp-agenda";
import { telDemoAanvraag } from "@/lib/voorstel/smileyapp-cijfers";
import { stuurAfspraakMelding, stuurBevestiging, stuurMelding } from "@/lib/voorstel/smileyapp-mail";
import { beheerVan, smileyPoort } from "@/lib/voorstel/smileyapp-poort";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Demo-aanvraag of partner-aanmelding van het SmileyApp-voorstel (openbaar onder
// /api/voorstel/smileyapp). POST {soort: "demo" | "partner", …} → {ok: true}.
// Volgorde: JSON en eigen site → limiet per IP → begrensde body → vorm (zod) en
// regels (lib/voorstel/smileyapp-aanvraag-regels.ts) → hooguit 5 aanvragen per
// 10 minuten per IP → bewaren → melding aan de beheerders. De aanvraag gaat
// alleen naar het eigen beheer; de melding bevat geen gegevens van de aanvrager.
// Deel 6a: met {tijdId} kiest de aanvrager een open tijd uit de agenda. Die wordt
// vóór het bewaren atomair geboekt (lib/voorstel/smileyapp-agenda.ts). Was een
// ander net eerder, dan is het antwoord 409 met de lijst van nu en is er niets
// bewaard of gemaild. Lukt het, dan staat de afspraak bij de aanvraag, noemt de
// melding aan de beheerders de tijd en krijgt de aanvrager (die daar zelf om
// vroeg door een tijd te kiezen) een bevestiging met een agendabestand.

const schema = z.object({
  soort: z.enum(["demo", "partner"]),
  naam: z.string().max(200),
  bedrijf: z.string().max(200),
  email: z.string().max(200),
  telefoon: z.string().max(60).optional(),
  pakket: z.string().max(20).optional(),
  interesses: lijst(z.string().max(60), { max: 10 }).optional(),
  dag: z.string().max(10).optional(),
  tijd: z.string().max(5).optional(),
  /** de gekozen tijd uit de agenda (het begin in UTC als twaalf cijfers); de regels controleren de vorm */
  tijdId: z.string().max(12).optional(),
  bericht: z.string().max(4000).optional(),
  /** waar de bezoeker vandaan kwam (?bron= op de QR-code); een bron die niet klopt valt weg */
  bron: z.string().max(60).optional(),
  /** de taal van het formulier (/demo, /en/demo of /de/demo); iets anders wordt geweigerd */
  taal: z.enum(["nl", "en", "de"]).optional(),
  toestemming: z.boolean(),
  /** lokveld: een mens ziet het niet en laat het leeg */
  lokveld: z.string().max(200).optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const ip = await smileyPoort(request, { json: true });
    const gelezen = await jsonBegrensd(request, 16_000);
    const parsed = schema.safeParse(gelezen.ok ? gelezen.waarde : null);
    if (!parsed.success) throw AppError.validation("Controleer je gegevens.");
    const { lokveld, ...invoer } = parsed.data;
    // een robot vulde het lokveld: doen alsof het gelukt is, niets bewaren en niets mailen
    if (lokveld?.trim()) return NextResponse.json({ ok: true });

    const controle = valideerAanvraag(invoer, new Date());
    if (!controle.ok) throw AppError.validation(controle.fout, { veld: controle.veld });
    await enforceRateLimit({ name: "smileyapp-aanvraag", identifier: ip, limit: 5, windowSeconds: 600, message: "Je hebt net al een paar aanvragen gestuurd. Probeer het over tien minuten opnieuw." });

    // een gekozen tijd eerst boeken, op het id dat de aanvraag straks krijgt: twee mensen tegelijk, dan wint er één
    const nu = new Date();
    const id = nieuwAanvraagId();
    let afspraak: Afspraak | undefined;
    if (controle.tijdId) {
      // boeken bezet een tijd en mailt een adres dat niet gecontroleerd is: een eigen, strenge grens per IP en per adres
      const teVaak = "Je hebt vandaag al een demo ingepland. Wil je een andere tijd? Mail ons dan even.";
      await enforceRateLimit({ name: "smileyapp-boeking-ip", identifier: ip, limit: 3, windowSeconds: 86_400, message: teVaak });
      await enforceRateLimit({ name: "smileyapp-boeking-adres", identifier: controle.waarde.email.toLowerCase(), limit: 2, windowSeconds: 86_400, message: teVaak });
      const geboekt = await boekTijd(controle.tijdId, id, nu);
      if (!geboekt) {
        // niets bewaard en niets gemaild; het formulier krijgt de lijst van nu (alleen tijden, geen namen)
        return NextResponse.json({ error: { code: "TIJD_BEZET", message: TIJD_BEZET, details: { veld: "tijdId" } }, afspraken: await afsprakenVoorSite(invoer.taal ?? "nl", nu) }, { status: 409 });
      }
      afspraak = { tijd: geboekt.id, start: geboekt.start };
    }
    const geboekt = afspraak;
    const aanvraag = await maakAanvraag({ ...controle.waarde, ...(geboekt ? { afspraak: geboekt } : {}) }, nu, id).catch(async (e: unknown) => {
      // bewaren mislukt: de tijd komt weer vrij
      if (geboekt) await geefTijdVrij(geboekt.tijd, id);
      throw e;
    });
    // de teller voor "Cijfers" in het beheer (alleen een aantal per dag); mag mislukken
    if (aanvraag.soort === "demo") void telDemoAanvraag().catch(() => undefined);
    // de melding mag mislukken: de aanvraag staat al in het beheer
    const beheer = beheerVan(request);
    void beheerderAdressen()
      .then((ontvangers) => (geboekt ? stuurAfspraakMelding({ bedrijf: aanvraag.bedrijf, beheer, start: geboekt.start, ontvangers }) : stuurMelding({ soort: aanvraag.soort, bedrijf: aanvraag.bedrijf, beheer, ontvangers })))
      .catch(() => undefined);
    // de bevestiging aan de aanvrager, alleen bij een gekozen tijd; mag mislukken (de afspraak staat)
    if (geboekt) {
      void stuurBevestiging({ to: aanvraag.email, naam: aanvraag.naam, start: geboekt.start, moment: afspraakInTaal(geboekt.start, aanvraag.taal ?? "nl"), taal: aanvraag.taal, tijd: geboekt.tijd, contact: CONTACT.email, nu }).catch(() => undefined);
    }
    return NextResponse.json({ ok: true, ...(geboekt ? { afspraak: { start: geboekt.start } } : {}) });
  } catch (err) {
    return jsonError(err);
  }
}
