import type { Whitepaper } from "@/lib/kennis/whitepapers";
import { BASE_FEE_PER_HOUR_CENTS, VOLUME_TIERS, tierRateCents } from "@/lib/pricing/tiers";
import { SHIFT_TEMPLATES } from "@/lib/shifts/catalogus";
import { SHIFT_CATEGORIES, type ShiftCategoryKey } from "@/lib/shifts/category";

// ---------------------------------------------------------------------------
// Het tarievenoverzicht: richttarief per functie en branche plus de staffel van
// de platformkosten. Puur. De pagina /tarieven-overzicht en de pdf (whitepaper
// "tarieven-overzicht") lezen allebei dit bestand, en dit bestand leest de
// bedragen uit de catalogus (lib/shifts/catalogus.ts) en de staffel
// (lib/pricing/tiers.ts). Typ hier dus nooit een bedrag over.
//
// De uitzendopslag is niet openbaar: hier staat geen percentage of bedrag voor
// uitzenden, alleen de verwijzing naar een offerte (tests/tarieven-overzicht.test.ts).
// ---------------------------------------------------------------------------

export const TARIEVEN_SLUG = "tarieven-overzicht";
export const TARIEVEN_PDF = `/api/kennis/whitepaper/${TARIEVEN_SLUG}`;

/** "€ 16,20": vaste schrijfwijze, ook in de pdf (geen harde spatie). */
export const euro = (cents: number): string => `€ ${(cents / 100).toFixed(2).replace(".", ",")}`;

/** 2000 → "2.000" */
const duizend = (n: number): string => String(n).replace(/\B(?=(\d{3})+$)/g, ".");

export interface TariefRij {
  key: string;
  functie: string;
  /** richttarief van de catalogus, per uur */
  richtCents: number;
  /** platformkosten per gewerkt uur, basisbedrag van de staffel */
  platformCents: number;
  samenCents: number;
}

export interface TariefGroep {
  branche: ShiftCategoryKey;
  label: string;
  rijen: TariefRij[];
}

/** Elke functie uit de catalogus, per branche, in de volgorde van de galerij. */
export function tariefGroepen(): TariefGroep[] {
  return SHIFT_CATEGORIES.map((c) => ({
    branche: c.key,
    label: c.label,
    rijen: SHIFT_TEMPLATES.filter((t) => t.branche === c.key).map((t) => ({
      key: t.key,
      functie: t.label,
      richtCents: t.hourlyRateCents,
      platformCents: BASE_FEE_PER_HOUR_CENTS,
      samenCents: t.hourlyRateCents + BASE_FEE_PER_HOUR_CENTS,
    })),
  })).filter((g) => g.rijen.length > 0);
}

export interface StaffelRij {
  naam: string;
  /** "Tot 500 uur per maand" of "Vanaf 500 uur per maand" */
  uren: string;
  centsPerUur: number;
}

export function staffelRijen(): StaffelRij[] {
  return VOLUME_TIERS.map((tier, i) => {
    const volgende = VOLUME_TIERS[i + 1];
    const uren =
      tier.fromHours > 0
        ? `Vanaf ${duizend(tier.fromHours)} uur per maand`
        : volgende
          ? `Tot ${duizend(volgende.fromHours)} uur per maand`
          : "Elk gewerkt uur";
    return { naam: tier.name, uren, centsPerUur: tierRateCents(tier) };
  });
}

export const TARIEVEN_TEKST = {
  titel: "Tarievenoverzicht",
  ondertitel: "Richttarief per functie en de platformkosten per uur",
  intro:
    "Wat kost een flexkracht per uur? In dit overzicht staat per functie het richttarief dat ZekerFlex voorstelt als je een klus plaatst, met de platformkosten erbij. Zo zie je vooraf waar je op uitkomt.",
  lezen:
    "Het richttarief is een voorstel: jij bepaalt zelf het tarief van je klus. De platformkosten komen daar per gewerkt uur bij. Alle bedragen zijn per uur en exclusief btw.",
  staffel:
    "De platformkosten betaal je alleen over uren die echt gewerkt en goedgekeurd zijn. Werk je in een maand met veel uren, dan dalen de platformkosten voor de uren vanaf de grens.",
  zelfstandige:
    "Huur je een zelfstandige in, dan betaal je het uurtarief van de klus plus de platformkosten per gewerkt uur. Er is geen abonnement en er zijn geen opstart- of plaatsingskosten.",
  uitzend:
    "Wil je liever geen werkgeversrisico, dan kun je iemand inhuren als uitzendkracht via het ZekerFlex uitzendbureau. ZekerFlex is dan de werkgever en regelt loon, cao en pensioen. Daarvoor geldt een uitzendtarief per uur. Dat hangt af van de functie en de inzet, en je krijgt het vooraf in een offerte.",
  uitzendVraag: "Vraag een offerte aan via de contactpagina van ZekerFlex, of lees eerst meer op de pagina over het uitzendbureau.",
} as const;

export const TARIEF_TIPS: { titel: string; tekst: string }[] = [
  {
    titel: "Reken avond, nacht en weekend mee",
    tekst: "Voor een dienst buiten kantoortijd zijn minder mensen beschikbaar. Een hoger tarief dan overdag maakt de kans op een reactie groter.",
  },
  {
    titel: "Maak een korte dienst de moeite waard",
    tekst: "Voor twee of drie uur werk reist iemand net zo ver als voor een hele dag. Een iets hoger tarief of een langere dienst helpt.",
  },
  {
    titel: "Houd rekening met de reisafstand",
    tekst: "Ligt je locatie buiten de stad of is ze lastig te bereiken met het openbaar vervoer, reken dat dan mee in je tarief.",
  },
  {
    titel: "Betaal voor vereiste papieren",
    tekst: "Werk waarvoor een diploma, pas, certificaat of VOG nodig is, kunnen minder mensen doen. Zet de eis in je klus en kies een tarief dat daarbij past.",
  },
  {
    titel: "Plaats op tijd en wees duidelijk",
    tekst: "Een klus die een paar dagen vooruit staat, met heldere taken en tijden, wordt door meer mensen gezien dan een oproep op het laatste moment.",
  },
];

/** Het overzicht als whitepaper: de leespagina en de pdf (lib/pdf/whitepaper.ts) tonen dezelfde bedragen. */
export function tarievenWhitepaper(): Whitepaper {
  return {
    slug: TARIEVEN_SLUG,
    title: TARIEVEN_TEKST.titel,
    subtitle: TARIEVEN_TEKST.ondertitel,
    category: "Tarieven",
    updated: "2026-11-18",
    readMinutes: 5,
    intro: TARIEVEN_TEKST.intro,
    sections: [
      {
        heading: "Zo lees je dit overzicht",
        blocks: [
          { t: "p", text: TARIEVEN_TEKST.lezen },
          {
            t: "ul",
            items: [
              "Richttarief: het uurtarief dat ZekerFlex voorstelt voor deze functie",
              `Platformkosten: ${euro(BASE_FEE_PER_HOUR_CENTS)} per gewerkt uur`,
              "Samen: richttarief plus platformkosten, wat je per uur betaalt voor een zelfstandige",
            ],
          },
        ],
      },
      {
        heading: "Richttarief per functie",
        blocks: tariefGroepen().flatMap((g) => [
          { t: "h3" as const, text: g.label },
          {
            t: "ul" as const,
            items: g.rijen.map((r) => `${r.functie}: ${euro(r.richtCents)} per uur. Samen met de platformkosten: ${euro(r.samenCents)} per uur.`),
          },
        ]),
      },
      {
        heading: "Platformkosten per gewerkt uur",
        blocks: [
          { t: "p", text: TARIEVEN_TEKST.staffel },
          { t: "ul", items: staffelRijen().map((s) => `${s.uren}: ${euro(s.centsPerUur)} per uur`) },
        ],
      },
      {
        heading: "Zelfstandige of uitzendkracht",
        blocks: [
          { t: "h3", text: "Een zelfstandige" },
          { t: "p", text: TARIEVEN_TEKST.zelfstandige },
          { t: "h3", text: "Een uitzendkracht" },
          { t: "p", text: TARIEVEN_TEKST.uitzend },
          { t: "p", text: TARIEVEN_TEKST.uitzendVraag },
        ],
      },
      {
        heading: "Vijf tips voor een tarief dat reacties krijgt",
        blocks: [{ t: "ul", items: TARIEF_TIPS.map((tip) => `${tip.titel}. ${tip.tekst}`) }],
      },
      {
        heading: "Zelf proberen",
        blocks: [
          {
            t: "p",
            text: "Op zekerflex.com/klus-plaatsen stel je een klus samen zonder account en zie je direct wat hij kost. De actuele bedragen staan op zekerflex.com/tarieven-overzicht.",
          },
        ],
      },
    ],
  };
}
