import type { ModuleSleutel } from "@/lib/horeca/modules";

// ---------------------------------------------------------------------------
// De kant-en-klare schermen van het horeca-pakket. Elk scherm is gemaakt voor
// één plek in de zaak en één soort apparaat: de handheld van de bediening, een
// tablet of monitor in de keuken, een tv voor gasten. Een apparaat koppel je
// met een code aan de zaak (lib/horeca/apparaten.ts) en het opent dan altijd
// zijn eigen scherm. Elk scherm mag alleen de acties die bij die plek horen.
// Puur, dus ook in de browser bruikbaar en los te testen.
// ---------------------------------------------------------------------------

export const SCHERM_ROLLEN = ["bediening", "kassa", "keuken", "bar", "uitgifte", "ontvangst", "afhaal", "overzicht"] as const;
export type SchermRol = (typeof SCHERM_ROLLEN)[number];

export type ApparaatSoort = "handheld" | "tablet" | "monitor" | "tv";
export const APPARAAT_LABEL: Record<ApparaatSoort, string> = { handheld: "Telefoon of handheld", tablet: "Tablet", monitor: "Monitor of pc", tv: "Tv-scherm" };

/** Wat een scherm mag wijzigen (de API controleert dit, lib/horeca/scherm-server.ts). */
export const SCHERM_ACTIES = ["fase", "serveer", "bestelling", "uitverkocht", "reservering-status", "reservering-tafel", "inloop", "oproep-af", "tafel-vrij", "afrekenen", "verkoop", "voorraad"] as const;
export type SchermActie = (typeof SCHERM_ACTIES)[number];

export interface SchermSoort {
  rol: SchermRol;
  naam: string;
  kort: string;
  /** de apparaten waarvoor het scherm gemaakt is, de beste eerst */
  apparaten: ApparaatSoort[];
  stand: "staand" | "liggend" | "beide";
  /** minstens één van deze modules moet aan staan (leeg = altijd) */
  modules: ModuleSleutel[];
  punten: string[];
  acties: SchermActie[];
  /** zo vaak haalt het scherm nieuwe gegevens op */
  verversSec: number;
}

export const SCHERMEN: Record<SchermRol, SchermSoort> = {
  bediening: {
    rol: "bediening",
    naam: "Bediening",
    kort: "De handheld van de bediening: tafels, bestellingen opnemen en serveren",
    apparaten: ["handheld", "tablet"],
    stand: "staand",
    modules: ["bestellen"],
    punten: ["Alle tafels in één oogopslag, wat aandacht vraagt bovenaan", "Bestelling opnemen in een paar tikken, direct naar keuken en bar", "Seintje als er iets klaarstaat of een gast de ober roept", "Tafel vrijgeven na het afrekenen"],
    acties: ["serveer", "bestelling", "oproep-af", "tafel-vrij", "reservering-status", "afrekenen"],
    verversSec: 5,
  },
  kassa: {
    rol: "kassa",
    naam: "Kassa",
    kort: "Afrekenen aan de bar of balie: rekeningen, splitsen, fooi en bon",
    apparaten: ["tablet", "monitor"],
    stand: "liggend",
    modules: ["kassa"],
    punten: ["Alle open rekeningen, per tafel of bestelling", "Splitsen gelijk of per gerecht, fooi en wisselgeld", "Bon met btw-specificatie, ook voor een bonprinter", "Snelle verkoop: kiezen en meteen afrekenen"],
    acties: ["afrekenen", "verkoop", "tafel-vrij"],
    verversSec: 5,
  },
  keuken: {
    rol: "keuken",
    naam: "Keuken",
    kort: "Keukenscherm met bonnen, wachttijden en alles-tegelijk",
    apparaten: ["tablet", "monitor"],
    stand: "liggend",
    modules: ["bestellen"],
    punten: ["Bonnen op volgorde, kleur bij lang wachten", "Tik Start en Klaar; per ongeluk afgemeld haal je terug", "Alles-tegelijk: hoeveel van elk gerecht er nog moet", "Geluid bij een nieuwe bon; gerecht met één tik uitverkocht"],
    acties: ["fase", "uitverkocht", "voorraad"],
    verversSec: 4,
  },
  bar: {
    rol: "bar",
    naam: "Bar",
    kort: "Barscherm met alleen de drankjes, los van de keuken",
    apparaten: ["tablet", "monitor"],
    stand: "liggend",
    modules: ["bestellen"],
    punten: ["Alleen de bar-regels van elke bestelling", "Drankjes klaar terwijl de keuken nog bezig is", "Geluid bij een nieuwe bon"],
    acties: ["fase", "uitverkocht", "voorraad"],
    verversSec: 4,
  },
  uitgifte: {
    rol: "uitgifte",
    naam: "Uitgifte",
    kort: "De pass: wat klaarstaat, per tafel, om weg te brengen",
    apparaten: ["tablet", "monitor"],
    stand: "liggend",
    modules: ["bestellen"],
    punten: ["Alles wat klaarstaat, oudste eerst", "Tafel en gerechten groot in beeld", "Afvinken als het geserveerd is"],
    acties: ["serveer"],
    verversSec: 4,
  },
  ontvangst: {
    rol: "ontvangst",
    naam: "Ontvangst",
    kort: "De gastvrouw: reserveringen van vandaag, aankomst en vrije tafels",
    apparaten: ["tablet", "handheld"],
    stand: "beide",
    modules: ["reserveren"],
    punten: ["Wie er vandaag komt, op tijd", "Aangekomen of niet gekomen met één tik", "Vrije tafels live, tafel toewijzen", "Inloop (zonder reservering) direct inboeken"],
    acties: ["reservering-status", "reservering-tafel", "inloop"],
    verversSec: 10,
  },
  afhaal: {
    rol: "afhaal",
    naam: "Afhaalscherm",
    kort: "Voor gasten: welke nummers klaar zijn om op te halen",
    apparaten: ["tv", "monitor"],
    stand: "liggend",
    modules: ["bestellen"],
    punten: ["Grote nummers: in bereiding en klaar", "Voor bestellingen zonder tafel (balie, afhalen, bar)", "Geen namen in beeld"],
    acties: [],
    verversSec: 5,
  },
  overzicht: {
    rol: "overzicht",
    naam: "Live-overzicht",
    kort: "Het dashboard op een groot scherm in kantoor of achter de bar",
    apparaten: ["tv", "monitor"],
    stand: "liggend",
    modules: [],
    punten: ["Omzet, gasten en wachttijd van vandaag", "Alle tafels met hun status", "Wie er nog komt"],
    acties: [],
    verversSec: 15,
  },
};

export const isSchermRol = (s: unknown): s is SchermRol => typeof s === "string" && (SCHERM_ROLLEN as readonly string[]).includes(s);

/** Kan dit scherm met deze modules gebruikt worden? */
export const schermBeschikbaar = (rol: SchermRol, modules: readonly string[]) => {
  const nodig = SCHERMEN[rol].modules;
  return nodig.length === 0 || nodig.some((m) => modules.includes(m));
};

export const magActie = (rol: SchermRol, actie: SchermActie) => SCHERMEN[rol].acties.includes(actie);

/** Welk station (keuken/bar) een scherm bedient; de rest ziet alles. */
export const stationVan = (rol: SchermRol): "keuken" | "bar" | "alles" => (rol === "keuken" ? "keuken" : rol === "bar" ? "bar" : "alles");

// ── Koppelcodes ──────────────────────────────────────────────────────────────
// Zes tekens zonder tekens die op elkaar lijken (geen 0/O, 1/I/L), zodat je hem
// foutloos overtypt op een tablet. Getoond als "ABC-DEF".

export const KOPPEL_TEKENS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const KOPPEL_LENGTE = 6;
/** Zo lang is een koppelcode geldig. */
export const KOPPEL_MINUTEN = 15;

/** Een code uit willekeurige getallen (0–1): de server geeft crypto-getallen mee. */
export const maakKoppelcode = (willekeurig: () => number) =>
  Array.from({ length: KOPPEL_LENGTE }, () => KOPPEL_TEKENS[Math.floor(willekeurig() * KOPPEL_TEKENS.length) % KOPPEL_TEKENS.length] ?? "A").join("");

/** Wat iemand intypt naar de code: hoofdletters, zonder spaties en streepjes; een teken dat nooit in een code staat, maakt hem ongeldig. */
export function leesKoppelcode(invoer: string): string | null {
  const code = invoer.toUpperCase().replace(/[\s-]/g, "");
  if (code.length !== KOPPEL_LENGTE) return null;
  return [...code].every((t) => KOPPEL_TEKENS.includes(t)) ? code : null;
}

export const toonKoppelcode = (code: string) => `${code.slice(0, 3)}-${code.slice(3)}`;
