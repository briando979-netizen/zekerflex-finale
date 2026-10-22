// ---------------------------------------------------------------------------
// "Hoe doe ik…" — short, factual how-tos for the in-app assistant, per
// audience, pointing at real pages. Part of the RAG corpus (lib/rag/corpus.ts).
// Only describe screens that exist; update when a flow moves.
// ---------------------------------------------------------------------------

export type Audience = "public" | "werknemer" | "opdrachtgever" | "admin";

export interface HowTo {
  q: string;
  a: string;
  audience: Audience[];
  href?: string;
}

const W: Audience[] = ["werknemer"];
const E: Audience[] = ["opdrachtgever"];

export const HOWTOS: HowTo[] = [
  // ── werknemer ──
  { audience: W, href: "/dashboard/klussen", q: "Hoe vind ik een klus en reageer ik?", a: "Ga naar Ontdekken (Klussen). Filter met de chips op dag, afstand of soort werk. Open een klus en tik op Reageren; je kunt een motivatie toevoegen (✨ Help me schrijft er een voor je). De opdrachtgever kiest daarna wie hij inplant — je krijgt een melding als je bent uitgekozen." },
  { audience: W, href: "/dashboard/diensten", q: "Waar zie ik mijn geplande klussen?", a: "Onder Mijn klussen staan je reacties (in afwachting), je geplande klussen en je geschiedenis. Vanaf een klus kun je de opdrachtgever direct een bericht sturen." },
  { audience: W, href: "/dashboard/diensten", q: "Ik kan niet komen, hoe zeg ik af of vraag ik een vervanger?", a: "Open de klus in Mijn klussen en zoek daar een vervanger. Andere werknemers kunnen dan reageren. Laat het de opdrachtgever ook via de chat weten, hoe eerder hoe beter — afzeggen kort van tevoren telt mee in je betrouwbaarheid." },
  { audience: W, href: "/dashboard/uren", q: "Hoe vul ik mijn uren in?", a: "Op de dag van de klus check je in en uit op locatie. Daarna vul je onder Uren je werktijd en pauze in stappen in en dien je ze in. De opdrachtgever keurt ze goed; daarna volgt de uitbetaling." },
  { audience: W, href: "/dashboard/uitbetalingen", q: "Wanneer krijg ik betaald?", a: "Na goedkeuring van je uren. Als zzp'er kies je per dienst: direct bij goedkeuring (4%), binnen 3 werkdagen (2%) of gratis wachten tot de opdrachtgever betaalt (binnen 30 dagen). Als uitzendkracht krijg je loon met een loonstrook. Je ziet alles onder Uitbetalingen." },
  { audience: W, href: "/dashboard/verificatie", q: "Hoe verifieer ik mijn account?", a: "Onder Verificatie maak je drie foto's: voorkant en achterkant van je ID en een selfie. Je bankrekening bevestig je door in te loggen bij je bank (iDEAL via Stripe, € 0,01). Daarna controleert ZekerFlex je gegevens." },
  { audience: W, href: "/dashboard/fiscaal", q: "Hoe wijzig ik mijn IBAN?", a: "Onder Account → Fiscaal pas je je IBAN aan. Na een wijziging moet je de nieuwe rekening opnieuw bevestigen via inloggen bij je bank; tot dan worden uitbetalingen even vastgehouden, ter bescherming tegen misbruik." },
  { audience: W, href: "/dashboard/certificaten", q: "Waar upload ik mijn VCA, BHV of heftruckcertificaat?", a: "Onder Certificaten. Na controle zie je klussen waarvoor dat certificaat nodig is." },
  { audience: W, href: "/dashboard/beschikbaarheid", q: "Hoe geef ik mijn beschikbaarheid door?", a: "Onder Beschikbaarheid kies je de dagen en dagdelen waarop je kunt werken. Je krijgt dan vooral klussen te zien die daarbij passen." },
  { audience: W, href: "/dashboard/profiel", q: "Hoe maak ik mijn profiel sterker?", a: "Vul je profiel aan onder Profiel, upload certificaten en werk betrouwbaar: op tijd komen en niet last-minute afzeggen verhoogt je score. Goede beoordelingen van opdrachtgevers zie je onder Beoordelingen." },
  { audience: W, href: "/dashboard/berichten", q: "Hoe stuur ik de opdrachtgever een bericht?", a: "Via Chat, of vanaf de klus met de knop Bericht aan opdrachtgever. Met één opdrachtgever heb je altijd één gesprek." },
  { audience: W, href: "/dashboard/account/verwijderen", q: "Hoe verwijder ik mijn account?", a: "Onder Account → Account verwijderen. Openstaande uren en betalingen worden eerst afgerond." },
  // ── opdrachtgever ──
  { audience: E, href: "/werkgever/diensten/nieuw", q: "Hoe zet ik een klus uit?", a: "Ga naar Diensten → Nieuwe klus. Kies een vestiging of eenmalige locatie, titel, tijden, tarief en aantal plekken. ✨ Schrijf voor mij maakt de omschrijving en kledingvoorschriften. Na uitzetten worden passende werknemers gematcht en kunnen ze reageren." },
  { audience: E, href: "/werkgever/diensten", q: "Hoe kies ik een werknemer uit de reacties?", a: "Open de klus onder Diensten. Je ziet alle reacties met beoordeling, betrouwbaarheid en motivatie. Kies wie je inplant; die krijgt direct een melding." },
  { audience: E, href: "/werkgever/uren", q: "Hoe keur ik uren goed?", a: "Onder Uren staan de ingediende uren. Controleer werktijd en pauze en keur goed of stel een correctie voor. Opvallende signalen (zoals onmogelijke tijden) worden gemarkeerd." },
  { audience: E, href: "/werkgever/facturen", q: "Wat kost het en waar vind ik facturen?", a: "Je betaalt € 3,50 platformkosten per gewerkt uur bovenop het uurloon; geen abonnement. Facturen worden automatisch gemaakt en staan onder Facturen." },
  { audience: E, href: "/werkgever/templates", q: "Hoe hergebruik ik een klus?", a: "Sla een klus op als template onder Templates; bij een nieuwe klus kies je die template en zijn tarief, pauze, omschrijving en kleding zijn ingevuld." },
  { audience: E, href: "/werkgever/favorieten", q: "Hoe werk ik vaker met dezelfde mensen?", a: "Voeg goede werknemers toe aan Favorieten of maak een pool. Bij een nieuwe klus kun je hem eerst aan je pool aanbieden." },
  { audience: E, href: "/werkgever/geblokkeerd", q: "Hoe blokkeer ik een werknemer?", a: "Onder Geblokkeerd. Een geblokkeerde werknemer ziet je klussen niet meer en kan niet worden ingepland." },
  { audience: E, href: "/werkgever/locaties", q: "Hoe voeg ik een vestiging toe?", a: "Onder Locaties (alleen voor beheerders van de organisatie)." },
  { audience: E, href: "/werkgever/team", q: "Hoe voeg ik collega's toe?", a: "Onder Team nodig je collega's uit en kies je hun rol." },
  { audience: E, href: "/werkgever/integraties", q: "Kan ik ZekerFlex koppelen aan mijn eigen systemen?", a: "Ja, onder Integraties: een agenda-feed (iCal), CSV-exports van uren en facturen, meldingen naar Slack of Teams, webhooks en een API-sleutel." },
  { audience: E, href: "/werkgever/overeenkomsten", q: "Hoe zit het met de Wet DBA?", a: "Elke opdracht met een zzp'er loopt via een goedgekeurde modelovereenkomst die je onder Overeenkomsten terugvindt; ZekerFlex bewaakt de signalen automatisch. Voor een vaste rol zonder zelfstandigheid kies je Via het ZekerFlex-uitzendbureau." },
  // ── allebei ──
  { audience: ["werknemer", "opdrachtgever"], q: "Hoe zet ik meldingen aan?", a: "In Chat → Instellingen → Meldingen zet je pushmeldingen aan op dit apparaat. Per gesprek kun je ook dempen." },
  { audience: ["werknemer", "opdrachtgever", "public"], q: "Hoe neem ik contact op met ZekerFlex?", a: "Via Chat → Tools → Support, of mail info@zekerflex.com." },
];
