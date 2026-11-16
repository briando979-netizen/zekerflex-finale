// ---------------------------------------------------------------------------
// De luisterdemo van de telefoonassistent op /aanbod/telefonie (16 nov 2026, eigenaar: "maak een voorbeeld audio hoe
// het klinkt en laat ze eerst hun website of bedrijf invullen om de ai te horen met een test klant"). Een kort gesprek
// tussen de assistent van een zaak en een testklant, voorgelezen door onze eigen stemmen (Piper).
//
// Het gesprek volgt vaste regels met de feiten van de site (naam, soort zaak, openingstijden), niet ons taalmodel:
// gemeten op 16 nov verzon gemma3:4b dingen namens de zaak ("nee, we hebben geen APK-afspraken beschikbaar", "ik kijk
// de voorraad even na", een fout "nee" op een open dag) en kopieerde hij de voorbeeldvraag. Een demo mag nooit iets
// zeggen wat de zaak niet zei; de assistent antwoordt dus alleen met wat vaststaat en zet verder een terugbelverzoek
// klaar, precies wat hij belooft.
//
// Puur bestand (ook voor de browser). De server staat in lib/telephony/demo-server.ts.
// ---------------------------------------------------------------------------

export type Spreker = "assistent" | "klant";

export interface DemoRegel {
  wie: Spreker;
  tekst: string;
}

/** Wat de assistent over de zaak weet: van de website, of alleen de naam. */
export interface ZaakInfo {
  naam: string;
  omschrijving?: string;
  /** al uitgeschreven om voor te lezen: "maandag tot en met vrijdag van 9 tot 17 uur" */
  openingstijden?: string[];
}

/** Eén regel zoals de browser hem krijgt: de tekst en het geluid (mp3 of wav, base64), of null als de stem er niet was. */
export interface DemoRegelMetGeluid extends DemoRegel {
  geluid: { mime: string; data: string } | null;
}

export interface DemoGesprek {
  zaak: string;
  regels: DemoRegelMetGeluid[];
}

export const MAX_INVOER = 200;

/** De testklant (de stem is een mannenstem: deploy/piper, nl-man). */
export const TESTKLANT = "Daan";

/** Wat de bezoeker invulde: een webadres (met of zonder https://) of gewoon de naam van de zaak. */
export function leesInvoer(raw: string): { soort: "website"; url: string } | { soort: "naam"; naam: string } | null {
  const t = raw.trim().replace(/\s+/g, " ").slice(0, MAX_INVOER);
  if (t.length < 2) return null;
  const zonderSchema = t.replace(/^https?:\/\//i, "");
  if (!/\s/.test(zonderSchema) && /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(\/\S*)?$/i.test(zonderSchema)) {
    return { soort: "website", url: /^https?:\/\//i.test(t) ? t : `https://${t}` };
  }
  return { soort: "naam", naam: t.slice(0, 80) };
}

const kaal = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * De naam van de zaak uit de site: og:site_name, anders het deel van de titel dat op het domein lijkt ("Home | Bakkerij
 * Jansen" op bakkerijjansen.nl → "Bakkerij Jansen"), anders het eerste deel, anders het domein zelf.
 */
export function naamVanSite(titel: string | null, siteNaam: string | null, host: string): string {
  const schoon = (s: string) => s.replace(/\s+/g, " ").trim();
  if (siteNaam && schoon(siteNaam).length >= 2 && schoon(siteNaam).length <= 60) return schoon(siteNaam);
  const domein = host.replace(/^www\./i, "").split(".")[0] ?? host;
  if (titel) {
    const delen = titel
      .split(/\s+[|–—·-]\s+|\s*\|\s*|:\s+/)
      .map(schoon)
      .filter((d) => d.length >= 2 && !/^(home|homepage|welkom|start|startpagina|index)$/i.test(d));
    const opDomein = delen.find((d) => kaal(d).length >= 3 && (kaal(domein).includes(kaal(d)) || kaal(d).includes(kaal(domein))));
    const keuze = opDomein ?? delen.find((d) => d.length <= 40) ?? delen[0];
    if (keuze) return keuze.slice(0, 60);
  }
  return domein.charAt(0).toUpperCase() + domein.slice(1);
}

/** "Maandag t/m vrijdag" en "09:00 – 17:30" → "maandag tot en met vrijdag van 9 tot 17 uur 30", om voor te lezen. */
export function uurVoorlezen(dag: string, tijd: string): string {
  const d = dag.replace(/t\/m/gi, "tot en met").toLowerCase();
  if (/gesloten/i.test(tijd)) return `${d} gesloten`;
  if (/afspraak/i.test(tijd)) return `${d} op afspraak`;
  const stuk = (u: string, m: string) => (m === "00" ? `${Number(u)}` : `${Number(u)} uur ${m}`);
  const reeksen = [...tijd.matchAll(/(\d{1,2}):(\d{2})\s*–\s*(\d{1,2}):(\d{2})/g)].map((m) => {
    const eind = m[4] === "00" ? `${Number(m[3])} uur` : stuk(m[3] ?? "0", m[4] ?? "00");
    return `van ${stuk(m[1] ?? "0", m[2] ?? "00")} tot ${eind}`;
  });
  return reeksen.length ? `${d} ${reeksen.join(" en ")}` : d;
}

/** Tekens die een stem raar voorleest (t/m, &, markdown) netjes maken. */
export function voorStem(tekst: string): string {
  return tekst
    .replace(/t\/m/gi, "tot en met")
    .replace(/\s&\s/g, " en ")
    .replace(/[*_#`>]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** "a", "a en b", "a, b en c" */
function opsomming(delen: readonly string[]): string {
  if (delen.length <= 1) return delen[0] ?? "";
  return `${delen.slice(0, -1).join(", ")} en ${delen[delen.length - 1]}`;
}

/**
 * Wat de testklant vraagt, passend bij de soort zaak (herkend aan de naam en de omschrijving van de site). Vragen die
 * de assistent niet zelf kan regelen, zodat hij laat horen wat hij wel doet: een terugbelverzoek klaarzetten.
 */
const VRAGEN: { soort: RegExp; vraag: string }[] = [
  // niet los op "haar": dat staat ook in Haarlem
  { soort: /kap(per|salon)|barbier|haarstudio|haarsalon|haarmode/, vraag: "Hoi, ik wil graag een afspraak maken om mijn haar te laten knippen. Kan dat deze week nog?" },
  { soort: /garage|autobedrijf|\bapk\b|autoservice|banden/, vraag: "Goedemiddag, mijn auto moet binnenkort APK. Kan ik daarvoor een afspraak maken?" },
  { soort: /bakker|banket|patisserie|taart/, vraag: "Hallo, ik wil graag een taart bestellen voor zaterdag. Kan dat bij jullie?" },
  { soort: /restaurant|eetcaf|bistro|brasserie|pizzeria|lunchroom|grand caf|trattoria|sushi/, vraag: "Goedemiddag, ik wil graag een tafel reserveren voor vier personen op vrijdagavond. Kan dat nog?" },
  { soort: /tandarts|fysio|huisarts|praktijk|massage|schoonheid|nagelstudio|beauty|pedicure|osteopa/, vraag: "Hallo, ik wil graag een afspraak maken. Wanneer zou dat kunnen?" },
  { soort: /rijschool|rijles/, vraag: "Hoi, ik wil graag rijlessen nemen. Kan ik een proefles aanvragen?" },
  { soort: /schoonmaak|glazenwas/, vraag: "Goedemiddag, wij zoeken iemand die ons kantoor elke week kan schoonmaken. Kunnen jullie daarbij helpen?" },
  { soort: /loodgieter|installat|\bcv\b|cv-ketel|elektric|verwarming/, vraag: "Hallo, mijn cv-ketel doet het niet meer. Kan er iemand langskomen?" },
  { soort: /schilder|aannemer|bouwbedrijf|klusbedrijf|timmer|dakdek|stukadoor|hovenier/, vraag: "Goedemiddag, ik wil graag een offerte voor een klus aan mijn huis. Kan iemand eens komen kijken?" },
  { soort: /fiets/, vraag: "Hoi, mijn fiets heeft een lekke band. Kan ik vandaag nog langskomen?" },
  { soort: /uitzend|personeel|werving|detacher|flexwerk/, vraag: "Goedemiddag, wij zoeken voor volgende week twee extra mensen. Kunnen jullie daarbij helpen?" },
  { soort: /hotel|\bb&b\b|bed and breakfast|camping|vakantiepark|appartement/, vraag: "Hallo, hebben jullie nog een kamer vrij voor het komende weekend?" },
  { soort: /advocat|notaris|accountant|administratie|boekhoud|belasting|makelaar|hypothe/, vraag: "Goedemiddag, ik heb een vraag waar ik graag even iemand over spreek. Kan dat?" },
];
const ALGEMENE_VRAAG = "Hallo, ik heb een vraag over jullie diensten. Kan ik daar iemand over spreken?";

export function vraagVoor(z: ZaakInfo): string {
  const tekst = `${z.naam} ${z.omschrijving ?? ""}`.toLowerCase();
  return VRAGEN.find((v) => v.soort.test(tekst))?.vraag ?? ALGEMENE_VRAAG;
}

/**
 * Het gesprek voor een zaak: de assistent neemt op met de naam van de zaak, zet de vraag door als terugbelverzoek en
 * noemt de openingstijden alleen als ze op de site staan. De assistent begint en eindigt.
 */
export function gesprekVoor(z: ZaakInfo): DemoRegel[] {
  const uren = z.openingstijden?.slice(0, 3) ?? [];
  const begin: DemoRegel[] = [
    { wie: "assistent", tekst: `Goedendag, u spreekt met de digitale assistent van ${z.naam}. Waarmee kan ik u helpen?` },
    { wie: "klant", tekst: vraagVoor(z) },
    { wie: "assistent", tekst: "Dat zet ik graag voor u door. Ik maak een terugbelverzoek, dan belt een collega u zo snel mogelijk terug om het met u te regelen. Mag ik uw naam?" },
    { wie: "klant", tekst: `Ja hoor, ik ben ${TESTKLANT} de Vries.` },
    { wie: "assistent", tekst: `Dank u wel, ${TESTKLANT}. Het terugbelverzoek staat klaar, met het nummer waarmee u nu belt. Kan ik verder nog iets voor u doen?` },
  ];
  if (uren.length) {
    return [
      ...begin,
      { wie: "klant", tekst: "Ja, wanneer zijn jullie eigenlijk open?" },
      { wie: "assistent", tekst: `Wij zijn open ${opsomming(uren)}.` },
      { wie: "klant", tekst: "Top, dank u wel!" },
      { wie: "assistent", tekst: "Graag gedaan. Fijne dag nog!" },
    ];
  }
  return [...begin, { wie: "klant", tekst: "Nee, dat was het. Dank u wel!" }, { wie: "assistent", tekst: "Graag gedaan. Fijne dag nog!" }];
}

/** Het vaste voorbeeld (een verzonnen kapsalon), om meteen te luisteren zonder iets in te vullen. */
export const VOORBEELD_ZAAK = "Kapsalon Knipwerk";
export const VOORBEELD: DemoRegel[] = [
  { wie: "assistent", tekst: "Goedemiddag, u spreekt met de digitale assistent van Kapsalon Knipwerk. Mijn collega's zijn aan het knippen, maar ik help u graag. Waarmee kan ik u helpen?" },
  { wie: "klant", tekst: "Hoi, ik wil graag een afspraak maken om mijn haar te laten knippen. Kan dat morgen?" },
  { wie: "assistent", tekst: "De agenda kan ik niet zelf invullen, maar ik zet een terugbelverzoek voor u klaar. Dan belt een collega u zo snel mogelijk om een tijd af te spreken. Mag ik uw naam?" },
  { wie: "klant", tekst: `Ja hoor, ik ben ${TESTKLANT} de Vries. Zijn jullie op zaterdag ook open?` },
  { wie: "assistent", tekst: `Dank u wel, ${TESTKLANT}. Ja, op zaterdag zijn we open van 9 tot 16 uur.` },
  { wie: "klant", tekst: "Top, dank je wel!" },
  { wie: "assistent", tekst: "Graag gedaan. Het terugbelverzoek staat klaar, met het nummer waarmee u nu belt. Fijne dag nog!" },
];
