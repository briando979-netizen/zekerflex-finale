import type { ShiftCategoryKey } from "@/lib/shifts/category";

// De teksten van de functiekiezer (components/app/SjabloonGalerij.tsx), Nederlands en Engels. Puur bestand: de kiezer
// wordt door de werkgeversapp (NL/EN) en door /klus-plaatsen (NL) gedeeld, dus de teksten komen als prop binnen met
// Nederlands als standaard (zoals components/auth/two-factor-texts.ts).

export interface SjabloonTeksten {
  taal: "nl" | "en";
  kop: string;
  optioneel: string;
  zoekLabel: string;
  zoekPlaceholder: string;
  brancheLabel: string;
  alleBranches: string;
  veelgekozen: string;
  /** "{n}" = het aantal functies */
  toonAlle: string;
  toonMinder: string;
  /** "{bedrag}" = "€ 16,20" */
  vanaf: string;
  gevondenEen: string;
  /** "{n}" */
  gevondenMeer: string;
  /** "{zoek}" = wat er is ingevuld */
  geenResultaat: string;
  eigen: string;
  /** de branche in de taal van de pagina (de catalogus zelf is Nederlands) */
  branches: Record<ShiftCategoryKey, string>;
}

export const SJABLOON_NL: SjabloonTeksten = {
  taal: "nl",
  kop: "Kies een functie",
  optioneel: "(optioneel)",
  zoekLabel: "Zoek een functie",
  zoekPlaceholder: "Zoek een functie, bijv. kok of magazijn",
  brancheLabel: "Branche",
  alleBranches: "Alle branches",
  veelgekozen: "Veelgekozen",
  toonAlle: "Toon alle {n} functies",
  toonMinder: "Toon minder",
  vanaf: "vanaf {bedrag} per uur",
  gevondenEen: "1 functie gevonden",
  gevondenMeer: "{n} functies gevonden",
  geenResultaat: "Geen functie gevonden voor “{zoek}”.",
  eigen: "Of vul het zelf in",
  branches: {
    retail: "Retail",
    horeca: "Horeca",
    logistiek: "Logistiek",
    productie: "Productie & industrie",
    schoonmaak: "Schoonmaak",
    evenement: "Evenement",
    promotie: "Promotie & sales",
    beveiliging: "Beveiliging",
    zorg: "Zorg",
    kinderopvang: "Kinderopvang & onderwijs",
    kantoor: "Kantoor",
    bouw: "Bouw & techniek",
    auto: "Auto & fiets",
    agrarisch: "Land- & tuinbouw",
    algemeen: "Overig",
  },
};

export const SJABLOON_EN: SjabloonTeksten = {
  taal: "en",
  kop: "Choose a role",
  optioneel: "(optional)",
  zoekLabel: "Search for a role",
  zoekPlaceholder: "Search a role, e.g. cook or warehouse",
  brancheLabel: "Industry",
  alleBranches: "All industries",
  veelgekozen: "Often chosen",
  toonAlle: "Show all {n} roles",
  toonMinder: "Show fewer",
  vanaf: "from {bedrag} per hour",
  gevondenEen: "1 role found",
  gevondenMeer: "{n} roles found",
  geenResultaat: "No role found for “{zoek}”.",
  eigen: "Or fill it in yourself",
  branches: {
    retail: "Retail",
    horeca: "Hospitality",
    logistiek: "Logistics",
    productie: "Production & industry",
    schoonmaak: "Cleaning",
    evenement: "Events",
    promotie: "Promotion & sales",
    beveiliging: "Security",
    zorg: "Healthcare",
    kinderopvang: "Childcare & education",
    kantoor: "Office",
    bouw: "Construction & technical",
    auto: "Automotive & bicycles",
    agrarisch: "Agriculture & horticulture",
    algemeen: "Other",
  },
};

/** "{n}"-plaatshouders invullen; een onbekende plaatshouder wordt leeg. */
export const vulIn = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));
