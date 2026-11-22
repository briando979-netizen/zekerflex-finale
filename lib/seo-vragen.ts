// ---------------------------------------------------------------------------
// /vragen en /vragen/<vraag> (22 nov 2026): korte antwoorden voor bedrijven, zoals een AI-assistent (ChatGPT via Bing,
// Perplexity, Claude) ze graag aanhaalt. Search Console liet zien dat bijna alle klikken op de merknaam komen, terwijl
// "personeel inhuren", "freelance uitzendbureau" en "schoonmaakpersoneel inhuren" al op pagina 1–2 staan zonder een
// pagina die de vraag rechtstreeks beantwoordt. Elke pagina: de vraag als h1, meteen een antwoord van twee of drie zinnen,
// dan de uitleg, de bronnen en een paar vragen.
// Eerlijk: ZekerFlex is zelf geen uitzendbureau (uitzendkrachten via een aangesloten uitzendbureau), geen belofte over
// snelheid, aantallen of resultaat, geen namen of prijzen van andere partijen, en geen uitzendopslag (die is niet openbaar).
// Bedragen komen uit de catalogus (lib/shifts/catalogus.ts) en de staffel (lib/pricing/tiers.ts): typ hier nooit een bedrag
// over. Puur: components/marketing/VraagLanding.tsx tekent het, de sitemap, llms.txt, de rondgang en de tests lezen het.
// ---------------------------------------------------------------------------

import type { Metadata } from "next";
import { SITE, breadcrumbJsonLd, canonical } from "@/lib/seo";
import { seoBeschrijving, TITEL_MAX } from "@/lib/seo-tekst";
import { SHIFT_TEMPLATES } from "@/lib/shifts/catalogus";
import { BASE_FEE_PER_HOUR_CENTS } from "@/lib/pricing/tiers";
import { TARIEVEN_TEKST, euro, staffelRijen } from "@/lib/kennis/tarieven-overzicht";
import { UITZEND_BEDRIJF } from "@/lib/seo-stad-pagina";
import type { Link, Vraag } from "@/lib/seo-stad";

export const VRAGEN_PAD = "/vragen";
export const VRAGEN_KOP = "Vragen van bedrijven over personeel inhuren";
/** De kop van het blok met links op /voor-bedrijven, /bedrijven en de branchehubs. */
export const BEDRIJFS_VRAGEN_KOP = "Veelgestelde vragen voor bedrijven";

export interface VraagBron {
  label: string;
  href: string;
}

export interface VraagTabel {
  kop: string;
  kolommen: readonly string[];
  rijen: readonly (readonly string[])[];
}

export interface VraagSectie {
  kop: string;
  alineas: readonly string[];
  lijst: readonly string[];
  tabel: VraagTabel | null;
}

export interface BedrijfsVraag {
  slug: string;
  /** de vraag zoals bedrijven hem stellen: de h1 */
  vraag: string;
  /** de titel in Google, zonder merk; met " | ZekerFlex" erachter hooguit 60 tekens */
  titel: string;
  /** de meta-beschrijving, hooguit 155 tekens */
  beschrijving: string;
  zoekwoorden: readonly string[];
  /** het directe antwoord in twee of drie zinnen: de eerste alinea onder de h1 */
  antwoord: string;
  secties: readonly VraagSectie[];
  faq: readonly Vraag[];
  /** waar het antwoord op steunt: onze eigen tarieven en officiële bronnen */
  bronnen: readonly VraagBron[];
  /** een regel onder de bronnen (geen juridisch advies), of null */
  noot: string | null;
  /** sleutels uit lib/seo-sectors.ts waar deze vraag bij hoort; die branchehub zet hem bovenaan */
  branches: readonly string[];
  /** ISO-datum */
  bijgewerkt: string;
}

// ---- bronnen -----------------------------------------------------------------

const BELASTINGDIENST: VraagBron = {
  label: "Belastingdienst: arbeidsrelaties, zzp of loondienst",
  href: "https://www.belastingdienst.nl/wps/wcm/connect/nl/arbeidsrelaties/arbeidsrelaties",
};
const BW7_URL = "https://wetten.overheid.nl/BWBR0005290/";
const WML: VraagBron = {
  label: "Wet minimumloon en minimumvakantiebijslag, artikel 15 (vakantiebijslag minstens 8 procent)",
  href: "https://wetten.overheid.nl/BWBR0002638/",
};
const TARIEVEN: VraagBron = { label: "Tarievenoverzicht van ZekerFlex: richttarief per functie", href: "/tarieven-overzicht" };

// ---- bedragen uit de catalogus en de staffel ----------------------------------

const FEE = euro(BASE_FEE_PER_HOUR_CENTS);

/** Het richttarief van een sjabloon uit de catalogus, of null als de sleutel er niet (meer) in staat. */
export function richttarief(key: string): { label: string; cents: number } | null {
  const t = SHIFT_TEMPLATES.find((x) => x.key === key);
  return t ? { label: t.label, cents: t.hourlyRateCents } : null;
}

const centsVan = (key: string): number => richttarief(key)?.cents ?? 0;
const MIN_CENTS = Math.min(...SHIFT_TEMPLATES.map((t) => t.hourlyRateCents));
const MAX_CENTS = Math.max(...SHIFT_TEMPLATES.map((t) => t.hourlyRateCents));

const TARIEF_KOLOMMEN = ["Functie", "Richttarief per uur", "Met platformkosten"] as const;

/** Rijen voor een tarieftabel: per sjabloon het richttarief en het bedrag met de platformkosten erbij. */
function tariefRijen(keys: readonly string[]): string[][] {
  return keys.flatMap((k) => {
    const t = richttarief(k);
    return t ? [[t.label, euro(t.cents), euro(t.cents + BASE_FEE_PER_HOUR_CENTS)]] : [];
  });
}
const brancheKeys = (branche: string): string[] => SHIFT_TEMPLATES.filter((t) => t.branche === branche).map((t) => t.key);

/** Het rekenvoorbeeld: een avond bediening van 17.00 tot 23.00 uur met 30 minuten pauze. */
export const VOORBEELD = (() => {
  const uurCents = centsVan("horeca");
  const samenCents = uurCents + BASE_FEE_PER_HOUR_CENTS;
  const uren = 5.5;
  const totaalCents = Math.round(samenCents * uren);
  return { uur: euro(uurCents), samen: euro(samenCents), uren: "5,5", totaal: euro(totaalCents), twee: euro(totaalCents * 2) };
})();

const sectie = (kop: string, delen: { alineas?: readonly string[]; lijst?: readonly string[]; tabel?: VraagTabel }): VraagSectie => ({
  kop,
  alineas: delen.alineas ?? [],
  lijst: delen.lijst ?? [],
  tabel: delen.tabel ?? null,
});

const BIJGEWERKT = "2026-11-22";

// ---- de vragen ----------------------------------------------------------------

export const BEDRIJFS_VRAGEN: readonly BedrijfsVraag[] = [
  {
    slug: "platform-uitzendbureau-of-zelf-werven",
    vraag: "Personeel inhuren: platform, uitzendbureau of zelf werven, wat kost wat?",
    titel: "Personeel inhuren: platform of uitzendbureau?",
    beschrijving:
      "Personeel inhuren via een platform, een uitzendbureau of zelf werven: wie de werkgever is, wat je betaalt en wanneer je wat kiest. Eerlijk vergeleken.",
    zoekwoorden: ["personeel inhuren", "platform of uitzendbureau", "uitzendbureau of zzp", "kosten uitzendkracht", "zelf personeel werven"],
    antwoord: `Via een platform betaal je het uurtarief van de zelfstandige plus een vaste vergoeding per gewerkt uur: bij ZekerFlex ${FEE}, zonder abonnement. Een uitzendbureau rekent één uitzendtarief per uur, waarin het loon, de werkgeverslasten en de marge van het bureau zitten; het bureau is dan de werkgever. Neem je zelf iemand in dienst, dan betaal je het loon plus de werkgeverslasten en draag je zelf de risico's, zoals loondoorbetaling bij ziekte.`,
    secties: [
      sectie("De drie manieren naast elkaar", {
        alineas: [
          "Hieronder staan de verschillen die voor de kosten en de risico's het meest uitmaken. Tarieven van uitzendbureaus noemen we niet: die verschillen per bureau, per functie en per cao, en je krijgt ze vooraf in een offerte.",
        ],
        tabel: {
          kop: "Platform, uitzendbureau of zelf in dienst",
          kolommen: ["", "Platform (zzp'er)", "Uitzendbureau", "Zelf in dienst nemen"],
          rijen: [
            ["Wie is de werkgever?", "Niemand: de zzp'er werkt als ondernemer, met een overeenkomst van opdracht", "Het uitzendbureau", "Jij"],
            ["Wat betaal je per uur?", `Het uurtarief van de zzp'er plus de platformkosten (ZekerFlex: ${FEE})`, "Het uitzendtarief uit de offerte van het bureau", "Het brutoloon plus werkgeverslasten, zoals premies, vakantiegeld en eventueel pensioen"],
            ["Vaste kosten", "Bij ZekerFlex geen abonnement en geen plaatsingskosten", "Verschilt per bureau", "Werving, inwerken en loonadministratie"],
            ["Bij ziekte of uitval", "Je betaalt alleen gewerkte uren en zet de klus opnieuw open", "Het bureau is de werkgever en regelt het volgens zijn cao", "Je betaalt het loon door, tot 104 weken en minstens 70 procent"],
            ["Wet DBA", "Let op gezag en inbedding: werkt iemand onder jouw leiding, dan past uitzenden beter", "Speelt niet: de uitzendkracht is werknemer van het bureau", "Speelt niet: het is loondienst"],
            ["Past bij", "Losse diensten, pieken en werk dat iemand zelfstandig doet", "Werk onder jouw leiding, ook voor langere tijd", "Vast werk dat doorloopt"],
          ],
        },
      }),
      sectie("Wat kost wat?", {
        alineas: [
          `Platform: voor bediening in de horeca stelt ZekerFlex een richttarief voor van ${VOORBEELD.uur} per uur. Met de platformkosten erbij is dat ${VOORBEELD.samen} per gewerkt uur, exclusief btw. Jij bepaalt zelf het tarief van je klus; in het tarievenoverzicht staat het richttarief per functie.`,
          "Uitzendbureau: het bureau rekent een uitzendtarief per uur, dat afhangt van de functie en de inzet. Je krijgt het vooraf in een offerte. Via ZekerFlex brengen we je in contact met een aangesloten uitzendbureau.",
          "Zelf in dienst: naast het brutoloon betaal je minstens 8 procent vakantiegeld, de werkgeverspremies en, als dat geldt, pensioen. Wordt iemand ziek, dan betaal je het loon door, tot 104 weken lang en minstens 70 procent.",
          "Wil je het voor je eigen situatie uitrekenen, met jouw uurloon en jouw uren? Dat kan in de gratis rekentool Kosten uitzendkracht berekenen.",
        ],
      }),
      sectie("Wanneer kies je wat?", {
        lijst: [
          "Een platform: voor losse diensten en pieken, als je zelf wilt kiezen wie er komt en het werk zelfstandig gedaan kan worden.",
          "Een uitzendbureau: als iemand onder jouw leiding werkt, in je vaste team, of als je het werkgeversrisico niet zelf wilt dragen.",
          "Zelf werven: als het werk vast is en blijft, en je tijd hebt voor werving, inwerken en administratie.",
        ],
      }),
    ],
    faq: [
      {
        q: "Is een platform goedkoper dan een uitzendbureau?",
        a: "Dat hangt af van het werk en van het tarief dat je afspreekt. Bij een platform zie je vooraf het uurtarief en de platformkosten; een uitzendbureau geeft je een offerte. Zet ze naast elkaar in de rekentool Kosten uitzendkracht berekenen.",
      },
      {
        q: "Kan ik via ZekerFlex ook uitzendkrachten krijgen?",
        a: `Ja, via een aangesloten uitzendbureau. Dat bureau is de werkgever en regelt het contract, het loon en het pensioen volgens zijn cao. ${TARIEVEN_TEKST.uitzendVraag}`,
      },
      UITZEND_BEDRIJF,
    ],
    bronnen: [
      TARIEVEN,
      { label: "Rekentool: kosten uitzendkracht berekenen", href: "/rekentools/kosten-uitzendkracht-berekenen" },
      WML,
      { label: "Burgerlijk Wetboek Boek 7, artikel 7:629 (loondoorbetaling bij ziekte) en 7:690 (uitzendovereenkomst)", href: BW7_URL },
      BELASTINGDIENST,
    ],
    noot: null,
    branches: [],
    bijgewerkt: BIJGEWERKT,
  },
  {
    slug: "wat-kost-een-flexwerker-per-uur",
    vraag: "Wat kost een flexwerker per uur?",
    titel: "Wat kost een flexwerker per uur?",
    beschrijving: `Het richttarief per functie plus ${FEE} platformkosten per gewerkt uur, met een rekenvoorbeeld. Geen abonnement; alle bedragen exclusief btw.`,
    zoekwoorden: ["wat kost een flexwerker", "flexwerker uurtarief", "kosten flexkracht per uur", "uurtarief zzp'er horeca", "platformkosten per uur"],
    antwoord: `Via ZekerFlex betaal je het uurtarief van de flexwerker plus ${FEE} platformkosten per gewerkt uur, zonder abonnement. Het richttarief dat wij per functie voorstellen, ligt tussen ${euro(MIN_CENTS)} en ${euro(MAX_CENTS)} per uur; voor bediening in de horeca is dat ${VOORBEELD.uur}, samen ${VOORBEELD.samen} per gewerkt uur. Alle bedragen zijn exclusief btw.`,
    secties: [
      sectie("Richttarief per functie", {
        alineas: [
          "Het richttarief is het uurtarief dat ZekerFlex voorstelt als je een klus plaatst. Het is een voorstel: jij bepaalt zelf het tarief van je klus. Een greep uit het tarievenoverzicht:",
        ],
        tabel: {
          kop: "Richttarief en wat je per gewerkt uur betaalt (exclusief btw)",
          kolommen: TARIEF_KOLOMMEN,
          rijen: tariefRijen(["horeca", "barista", "afwas", "kok", "orderpicker", "heftruck", "schoonmaak", "glazenwasser", "eventcrew", "verkoop", "promotie", "bezorger"]),
        },
      }),
      sectie("Rekenvoorbeeld: een avond in de bediening", {
        alineas: ["Je betaalt alleen uren die echt gewerkt zijn en die jij hebt goedgekeurd."],
        lijst: [
          `Uurtarief ${VOORBEELD.uur} plus platformkosten ${FEE}: ${VOORBEELD.samen} per gewerkt uur.`,
          `Een dienst van 17.00 tot 23.00 uur met 30 minuten pauze is ${VOORBEELD.uren} gewerkte uren; de pauze telt niet mee.`,
          `${VOORBEELD.uren} × ${VOORBEELD.samen} = ${VOORBEELD.totaal}, exclusief btw.`,
          `Met twee mensen op die avond: ${VOORBEELD.twee}.`,
        ],
      }),
      sectie("Minder platformkosten bij veel uren", {
        alineas: [TARIEVEN_TEKST.staffel],
        lijst: staffelRijen().map((s) => `${s.uren}: ${euro(s.centsPerUur)} per uur`),
      }),
      sectie("En een uitzendkracht?", { alineas: [TARIEVEN_TEKST.uitzend] }),
    ],
    faq: [
      {
        q: "Is het richttarief verplicht?",
        a: "Nee. Het is een voorstel; jij kiest het tarief van je klus. Voor een dienst 's avonds, 's nachts of in het weekend zijn minder mensen beschikbaar, en een hoger tarief maakt de kans op een reactie groter.",
      },
      {
        q: "Betaal ik ook voor de pauze?",
        a: "Nee. Je betaalt voor de gewerkte uren: de tijd van de dienst min de pauze die bij de klus staat. Ook de platformkosten tellen alleen over gewerkte en goedgekeurde uren.",
      },
      {
        q: "Wanneer betaal ik?",
        a: "Na afloop keur je de uren goed. Daarna maakt ZekerFlex de facturen automatisch aan, met de btw die erbij hoort.",
      },
    ],
    bronnen: [TARIEVEN, { label: "Rekentool: platformkosten berekenen bij jouw aantal uren", href: "/rekentools/platformkosten-berekenen" }],
    noot: null,
    branches: [],
    bijgewerkt: BIJGEWERKT,
  },
  {
    slug: "zzp-er-inhuren-via-platform-wet-dba",
    vraag: "Mag ik een zzp'er inhuren via een platform (Wet DBA)?",
    titel: "Zzp'er inhuren via een platform en de Wet DBA",
    beschrijving: "Ja, dat mag. Waar de Belastingdienst naar kijkt, wat er in 2026 geldt en wanneer een uitzendkracht via een uitzendbureau beter past.",
    zoekwoorden: ["zzp'er inhuren wet dba", "mag ik een zzp'er inhuren", "zzp platform wet dba", "schijnzelfstandigheid voorkomen", "wet dba 2026"],
    antwoord:
      "Ja, een zzp'er inhuren via een platform mag: de Wet DBA verbiedt dat niet. Of iemand echt als zelfstandige werkt, beoordeelt de Belastingdienst aan de hand van hoe er in de praktijk gewerkt wordt, niet aan de hand van het platform of het contract. Werkt iemand onder jouw leiding, zoals een werknemer, dan past een uitzendkracht via een aangesloten uitzendbureau beter.",
    secties: [
      sectie("Waar kijkt de Belastingdienst naar?", {
        alineas: ["De Belastingdienst weegt alle feiten en omstandigheden. Deze punten wegen zwaar:"],
        lijst: [
          "Gezag: geef je aanwijzingen over hoe het werk gedaan wordt, of alleen over het resultaat? 'De zaal is om 18.00 uur klaar' mag; elke stap voorschrijven lijkt op leidinggeven.",
          "Inbedding: doet iemand hetzelfde werk als je vaste mensen, in je vaste rooster, als vast onderdeel van het team?",
          "Persoonlijk werk: mag de zzp'er zich laten vervangen, of moet hij het werk zelf doen?",
          "Ondernemerschap: werkt de zzp'er voor meerdere opdrachtgevers, met een eigen tarief en eigen risico?",
          "Duur: een harde urengrens staat niet in de wet, maar veel uren voor één opdrachtgever laat de samenwerking meer op loondienst lijken.",
        ],
      }),
      sectie("Wat er nu geldt", {
        alineas: [
          "Sinds 1 januari 2025 handhaaft de Belastingdienst weer: het handhavingsmoratorium is voorbij. In 2026 legt de Belastingdienst voor schijnzelfstandigheid nog geen verzuimboetes op; vergrijpboetes zijn wel mogelijk.",
          "Stelt de Belastingdienst vast dat het loondienst is, dan kan de opdrachtgever een naheffing van loonheffingen en premies krijgen. De zzp'er kan fiscale voordelen kwijtraken, zoals de zelfstandigenaftrek.",
          "Nieuwe modelovereenkomsten beoordeelt de Belastingdienst sinds 6 september 2024 niet meer. Een modelovereenkomst bepaalt op zichzelf niet hoe de arbeidsrelatie wordt beoordeeld: de praktijk telt.",
        ],
      }),
      sectie("Wat ZekerFlex doet, en wat niet", {
        lijst: [
          "Per opdracht leggen we de afspraken vast: wie, wanneer, welk tarief en hoe de check-in ging.",
          "Bij een zzp'er controleren we de KVK-inschrijving.",
          "Het platform signaleert onder meer als iemand veel uren of veel weken achter elkaar bij jou werkt.",
          "Dat is geen garantie: hoe er in de praktijk gewerkt wordt, blijft bepalend. Twijfel je, kies dan een uitzendkracht via een aangesloten uitzendbureau.",
        ],
      }),
    ],
    faq: [
      {
        q: "Maakt een platform de samenwerking 'DBA-proof'?",
        a: "Nee. Geen platform, contract of modelovereenkomst maakt een samenwerking op zichzelf veilig. De Belastingdienst kijkt naar alle feiten en naar hoe er feitelijk gewerkt wordt; een platform helpt je de afspraken vast te leggen en risico's op tijd te zien.",
      },
      {
        q: "Geldt de grens van 650 uur nog?",
        a: "Een harde grens van 650 uur staat niet in de wet. Het is een vuistregel: wie heel veel uren voor één opdrachtgever werkt, lijkt meer op een werknemer. ZekerFlex geeft een signaal als een zzp'er richting de 600 uur bij één opdrachtgever gaat.",
      },
      {
        q: "Mag een zzp'er elke week bij mij werken?",
        a: "Dat kan, maar het telt mee in de beoordeling: steeds dezelfde persoon in je vaste rooster lijkt meer op loondienst. Is het werk vast en doorlopend, dan passen een uitzendkracht of een eigen werknemer vaak beter.",
      },
    ],
    bronnen: [
      BELASTINGDIENST,
      { label: "Wet DBA-kenniscentrum van ZekerFlex", href: "/kennis/wet-dba" },
      { label: "Wet DBA-check: tien vragen over je samenwerking", href: "/rekentools/wet-dba-check" },
    ],
    noot: "Dit is algemene informatie, geen juridisch of fiscaal advies.",
    branches: [],
    bijgewerkt: BIJGEWERKT,
  },
  {
    slug: "snel-horecapersoneel-inhuren-weekend",
    vraag: "Hoe huur ik snel horecapersoneel in voor het weekend?",
    titel: "Horeca personeel inhuren voor het weekend",
    beschrijving: `Horecapersoneel voor het weekend: wanneer je de klus plaatst, welk tarief past, zzp of uitzend, en wat het kost: het uurtarief plus ${FEE} per gewerkt uur.`,
    zoekwoorden: ["horeca personeel inhuren", "horecapersoneel weekend", "horeca personeel last minute", "bediening inhuren weekend", "horeca personeel inhuren kosten"],
    antwoord: `Plaats je klus zo vroeg mogelijk in de week, met de datum, de tijden, het adres, de functie en het uurtarief. Horecakrachten binnen reisafstand zien hem en reageren, en jij kiest wie je inroostert. Hoe snel dat gaat, hangt af van wie er beschikbaar is; je betaalt het uurtarief plus ${FEE} per gewerkt uur, zonder abonnement.`,
    secties: [
      sectie("Zo pak je het aan", {
        lijst: [
          "Plaats de klus een paar dagen vooruit. Een klus die op maandag of dinsdag online staat, zien meer mensen dan een oproep op vrijdagmiddag.",
          "Schrijf precies wat het werk is: bediening, bar, keuken of afwas, hoeveel gasten je verwacht en wat iemand aan moet, zoals een zwarte broek of antislipschoenen.",
          "Kies een tarief dat bij het weekend past. Voor diensten 's avonds en in het weekend zijn minder mensen beschikbaar; een hoger tarief maakt de kans op een reactie groter.",
          "Reageer vlot op wie zich meldt. Een aanmelding die blijft liggen, is vaak weg.",
          "Zet wie bevalt bij je favorieten, zodat je die een volgend weekend als eerste vraagt.",
        ],
      }),
      sectie("Richttarieven in de horeca", {
        alineas: ["Het richttarief is een voorstel; jij bepaalt het tarief van je klus. Met de platformkosten erbij, exclusief btw:"],
        tabel: { kop: "Horeca: richttarief en wat je per gewerkt uur betaalt", kolommen: TARIEF_KOLOMMEN, rijen: tariefRijen(brancheKeys("horeca")) },
      }),
      sectie("Zzp'er of uitzendkracht in de horeca?", {
        alineas: [
          "Werkt iemand een avond onder leiding van je bedrijfsleider, in je vaste team en volgens jouw werkwijze, dan lijkt dat al snel op werk in loondienst. Een uitzendkracht via een aangesloten uitzendbureau past dan beter; dat bureau is de werkgever.",
          "Een zzp'er past bij werk dat iemand zelfstandig en op eigen wijze doet, voor meerdere opdrachtgevers. Elk weekend dezelfde zzp'er in je vaste rooster laat de samenwerking meer op loondienst lijken.",
        ],
      }),
    ],
    faq: [
      {
        q: "Kan ik vandaag nog iemand vinden voor vanavond?",
        a: "Dat kan, maar we beloven het niet: het hangt af van wie er op dat moment in de buurt beschikbaar is. Een klus voor over een paar uur wordt minder vaak gevuld dan een klus die dagen vooruit staat.",
      },
      {
        q: "Moet een horecakracht een diploma hebben?",
        a: "Voor bediening, bar, afwas of keukenhulp niet. Een leidinggevende in de horeca moet wel de Verklaring Sociale Hygiëne hebben. Vraag je iets extra's, zoals ervaring met à-la-carte, zet dat dan in de klus.",
      },
      {
        q: "Wat kost een avond bediening?",
        a: `Een dienst van 17.00 tot 23.00 uur met 30 minuten pauze is ${VOORBEELD.uren} gewerkte uren. Met het richttarief van ${VOORBEELD.uur} en ${FEE} platformkosten betaal je ${VOORBEELD.totaal} per persoon, exclusief btw.`,
      },
    ],
    bronnen: [
      TARIEVEN,
      { label: "Horeca personeel inhuren, per stad", href: "/horeca-personeel-inhuren" },
      { label: "Leren: zo krijg je goede mensen", href: "/leren/personeel-krijgen" },
      BELASTINGDIENST,
    ],
    noot: null,
    branches: ["horeca", "evenementen"],
    bijgewerkt: BIJGEWERKT,
  },
  {
    slug: "schoonmaakpersoneel-inhuren-zzp-of-uitzend",
    vraag: "Schoonmaakpersoneel inhuren: zzp of uitzend?",
    titel: "Schoonmaakpersoneel inhuren: zzp of uitzend?",
    beschrijving: "Schoonmaakpersoneel inhuren als zzp'er of als uitzendkracht: wie de werkgever is, wanneer wat past en wat een schoonmaker per uur kost.",
    zoekwoorden: ["schoonmaakpersoneel inhuren", "schoonmakers inhuren", "schoonmaak inhuren", "schoonmaker zzp of uitzend", "schoonmaker inhuren kosten"],
    antwoord:
      "Allebei kan. Een zzp'er past als de schoonmaker zelfstandig werkt, op eigen wijze en voor meerdere opdrachtgevers, bijvoorbeeld bij een losse opleveringsschoonmaak of het glas. Maakt iemand volgens jouw rooster en onder jouw leiding schoon, dan past een uitzendkracht via een aangesloten uitzendbureau beter; dat bureau is dan de werkgever.",
    secties: [
      sectie("Het verschil in het kort", {
        tabel: {
          kop: "Zzp'er of uitzendkracht in de schoonmaak",
          kolommen: ["", "Zzp'er", "Uitzendkracht"],
          rijen: [
            ["Wie is de werkgever?", "Niemand: de zzp'er werkt als ondernemer", "Het aangesloten uitzendbureau"],
            ["Wat betaal je?", `Het uurtarief plus ${FEE} per gewerkt uur`, "Het uitzendtarief uit de offerte van het bureau"],
            ["Loon, pensioen en cao", "Regelt de zzp'er zelf", "Regelt het bureau, volgens zijn cao"],
            ["Past bij", "Losse klussen, opleveringen, glas en werk met eigen materiaal", "Een vaste ronde in jouw rooster, werk onder jouw leiding"],
          ],
        },
      }),
      sectie("Wat kost een schoonmaker per uur?", {
        alineas: [
          `Het richttarief voor een schoonmaakmedewerker is ${euro(centsVan("schoonmaak"))} per uur; met de platformkosten betaal je ${euro(centsVan("schoonmaak") + BASE_FEE_PER_HOUR_CENTS)} per gewerkt uur, exclusief btw. Voor de andere schoonmaakfuncties:`,
        ],
        tabel: { kop: "Schoonmaak: richttarief en wat je per gewerkt uur betaalt", kolommen: TARIEF_KOLOMMEN, rijen: tariefRijen(brancheKeys("schoonmaak")) },
      }),
      sectie("Waar let je op?", {
        lijst: [
          "Spreek het resultaat af, bijvoorbeeld met een checklist per ruimte, en laat de manier waarop aan een zelfstandige.",
          "Zet in de klus wie voor middelen en materiaal zorgt. Werkt iemand met eigen materiaal, dan past dat bij een zelfstandige.",
          "Werk met een hoogwerker vraagt meestal een certificaat, zoals IPAF, en op een bouwplaats geldt vaak een VCA-eis. Zet zulke eisen in de klus.",
          "Krijgt iemand een sleutel of toegangspas, kijk dan vooraf naar de reviews en de ervaring van wie reageert.",
        ],
      }),
    ],
    faq: [
      {
        q: "Kan ik als schoonmaakbedrijf extra schoonmakers inhuren?",
        a: "Ja. Je zet je klus op ZekerFlex en kiest zelf wie er bij jouw klant schoonmaakt. Werkt die schoonmaker volgens jouw vaste werkwijze en in jouw rooster, dan past een uitzendkracht via een aangesloten uitzendbureau beter dan een zzp'er.",
      },
      {
        q: "Wat is het verschil tussen schoonmaak en housekeeping?",
        a: "Housekeeping is schoonmaak in een hotel: kamers schoonmaken en bedden opmaken volgens de normen van het hotel. Voor beide staat een richttarief in het tarievenoverzicht.",
      },
    ],
    bronnen: [
      TARIEVEN,
      { label: "Schoonmaakpersoneel inhuren, per stad", href: "/schoonmaak-personeel-inhuren" },
      { label: "Burgerlijk Wetboek Boek 7, artikel 7:690 (uitzendovereenkomst)", href: BW7_URL },
      BELASTINGDIENST,
    ],
    noot: null,
    branches: ["schoonmaak"],
    bijgewerkt: BIJGEWERKT,
  },
  {
    slug: "wat-is-een-freelance-uitzendbureau",
    vraag: "Wat is een freelance uitzendbureau?",
    titel: "Wat is een freelance uitzendbureau?",
    beschrijving: "Een freelance uitzendbureau is geen officiële term. Het verschil tussen een uitzendbureau en een freelanceplatform, en hoe ZekerFlex werkt.",
    zoekwoorden: ["freelance uitzendbureau", "uitzendbureau voor freelancers", "freelanceplatform", "uitzendbureau of platform", "zzp uitzendbureau"],
    antwoord:
      "'Freelance uitzendbureau' is geen officiële term. Meestal bedoelen mensen een platform waar je freelancers (zzp'ers) inhuurt zoals je bij een uitzendbureau mensen aanvraagt, maar zonder dat iemand in dienst komt. ZekerFlex is zo'n platform en zelf geen uitzendbureau: uitzendkrachten krijg je via een aangesloten uitzendbureau, dat dan de werkgever is.",
    secties: [
      sectie("Uitzendbureau of freelanceplatform?", {
        alineas: [
          "Bij uitzenden heeft de uitzendkracht een arbeidsovereenkomst met het uitzendbureau. Het bureau stelt de uitzendkracht ter beschikking aan jou, en het werk gebeurt onder jouw toezicht en leiding: dat is de uitzendovereenkomst uit artikel 7:690 van het Burgerlijk Wetboek. Het bureau betaalt het loon en regelt het pensioen volgens zijn cao.",
          "Bij een freelanceplatform sluit je per klus een overeenkomst van opdracht met een zelfstandige (artikel 7:400 van het Burgerlijk Wetboek). Die werkt voor eigen rekening en risico, stuurt een factuur en regelt zelf belasting en verzekering. Het platform brengt jullie samen en regelt de uren, de facturen en de betaling.",
        ],
        tabel: {
          kop: "Uitzendbureau of freelanceplatform",
          kolommen: ["", "Uitzendbureau", "Freelanceplatform, zoals ZekerFlex"],
          rijen: [
            ["Werkgever", "Het uitzendbureau", "Niemand: de freelancer is ondernemer"],
            ["Overeenkomst", "Uitzendovereenkomst tussen het bureau en de kracht", "Overeenkomst van opdracht tussen jou en de freelancer"],
            ["Leiding over het werk", "Jij, als inlener", "Jij spreekt het resultaat af; de freelancer bepaalt hoe"],
            ["Kosten", "Het uitzendtarief per uur van het bureau", `Het uurtarief van de freelancer plus de platformkosten (ZekerFlex: ${FEE} per gewerkt uur)`],
            ["Loon, pensioen en cao", "Regelt het bureau", "Regelt de freelancer zelf"],
          ],
        },
      }),
      sectie("Hoe het bij ZekerFlex werkt", {
        lijst: [
          "Je plaatst een klus met de datum, de tijden, het adres en het uurtarief.",
          "Zzp'ers en flexwerkers binnen reisafstand zien hem en reageren; jij kiest wie je inroostert.",
          "Na afloop keur je de uren goed en maakt ZekerFlex de facturen automatisch aan.",
          "Wil je uitzendkrachten, dan brengen we je in contact met een aangesloten uitzendbureau. Dat bureau is de werkgever.",
        ],
      }),
    ],
    faq: [
      {
        q: "Wanneer kies ik een freelancer en wanneer een uitzendkracht?",
        a: "Een freelancer past bij werk dat iemand zelfstandig doet, op eigen wijze. Werkt iemand onder jouw leiding, in je vaste team of je vaste rooster, dan past een uitzendkracht beter: dan is het bureau de werkgever en speelt de vraag naar schijnzelfstandigheid niet.",
      },
      {
        q: "Wat kost een freelancer via ZekerFlex?",
        a: `Het uurtarief van de freelancer plus ${FEE} platformkosten per gewerkt uur, zonder abonnement. Het richttarief per functie staat in het tarievenoverzicht.`,
      },
    ],
    bronnen: [
      { label: "Burgerlijk Wetboek Boek 7, artikel 7:400 (overeenkomst van opdracht) en 7:690 (uitzendovereenkomst)", href: BW7_URL },
      BELASTINGDIENST,
      TARIEVEN,
    ],
    noot: null,
    branches: [],
    bijgewerkt: BIJGEWERKT,
  },
];

// ---- opzoeken -----------------------------------------------------------------

export function vraagBySlug(slug: string): BedrijfsVraag | undefined {
  return BEDRIJFS_VRAGEN.find((v) => v.slug === slug);
}

export const vraagPad = (v: Pick<BedrijfsVraag, "slug">): string => `${VRAGEN_PAD}/${v.slug}`;
export const vraagLink = (v: BedrijfsVraag): Link => ({ href: vraagPad(v), label: v.vraag });

/** Alle vragen, die van deze branche eerst (voor het blok op de branchehubs). */
export function vragenVoor(branche?: string): BedrijfsVraag[] {
  if (!branche) return [...BEDRIJFS_VRAGEN];
  const eigen = BEDRIJFS_VRAGEN.filter((v) => v.branches.includes(branche));
  return [...eigen, ...BEDRIJFS_VRAGEN.filter((v) => !v.branches.includes(branche))];
}

export const isExtern = (href: string): boolean => /^https?:\/\//.test(href);
const absoluut = (href: string): string => (isExtern(href) ? href : `${SITE.url}${href}`);

// ---- JSON-LD ------------------------------------------------------------------

/** Article (met de bronnen als citation), FAQPage (de vraag zelf eerst) en het kruimelpad. */
export function vraagJsonLd(v: BedrijfsVraag): Record<string, unknown>[] {
  return [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: v.vraag,
      description: v.antwoord,
      datePublished: v.bijgewerkt,
      dateModified: v.bijgewerkt,
      inLanguage: "nl-NL",
      author: { "@type": "Organization", name: SITE.name, url: SITE.url },
      publisher: { "@id": `${SITE.url}/#organization` },
      mainEntityOfPage: `${SITE.url}${vraagPad(v)}`,
      citation: v.bronnen.map((b) => absoluut(b.href)),
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      inLanguage: "nl-NL",
      mainEntity: [{ q: v.vraag, a: v.antwoord }, ...v.faq].map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    },
    breadcrumbJsonLd([
      ["Home", "/"],
      [VRAGEN_KOP, VRAGEN_PAD],
      [v.vraag, vraagPad(v)],
    ]),
  ];
}

/** Het overzicht: de vragen met hun korte antwoord, en het kruimelpad. */
export function vragenHubJsonLd(): Record<string, unknown>[] {
  return [
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      inLanguage: "nl-NL",
      mainEntity: BEDRIJFS_VRAGEN.map((v) => ({ "@type": "Question", name: v.vraag, url: `${SITE.url}${vraagPad(v)}`, acceptedAnswer: { "@type": "Answer", text: v.antwoord } })),
    },
    breadcrumbJsonLd([
      ["Home", "/"],
      [VRAGEN_KOP, VRAGEN_PAD],
    ]),
  ];
}

// ---- de zichtbare tekst (voor de tests) ----------------------------------------

export function vraagTekst(v: BedrijfsVraag): string {
  const delen: string[] = [v.vraag, v.antwoord];
  for (const s of v.secties) {
    delen.push(s.kop, ...s.alineas, ...s.lijst);
    if (s.tabel) delen.push(s.tabel.kop, ...s.tabel.kolommen, ...s.tabel.rijen.flat());
  }
  delen.push(...v.bronnen.map((b) => b.label));
  if (v.noot) delen.push(v.noot);
  for (const f of v.faq) delen.push(f.q, f.a);
  return delen.join("\n");
}

// ---- metadata -----------------------------------------------------------------

/** "<titel> | ZekerFlex" als dat past, anders de titel zelf. */
function metMerk(titel: string): string {
  const vol = `${titel} | ${SITE.name}`;
  return vol.length <= TITEL_MAX ? vol : titel;
}

export function vraagMetadata(v: BedrijfsVraag): Metadata {
  const description = seoBeschrijving(v.beschrijving);
  return {
    title: { absolute: metMerk(v.titel) },
    description,
    keywords: [...v.zoekwoorden],
    ...canonical(vraagPad(v), { title: v.vraag, description }),
  };
}

export function vragenHubMetadata(): Metadata {
  const description = seoBeschrijving(
    "Korte antwoorden voor bedrijven: wat een flexwerker per uur kost, platform of uitzendbureau, zzp'ers en de Wet DBA, en personeel voor horeca en schoonmaak.",
  );
  return {
    title: { absolute: metMerk(VRAGEN_KOP) },
    description,
    keywords: ["personeel inhuren vragen", "wat kost een flexwerker", "freelance uitzendbureau", "zzp'er inhuren wet dba", "schoonmaakpersoneel inhuren"],
    ...canonical(VRAGEN_PAD, { title: VRAGEN_KOP, description }),
  };
}
