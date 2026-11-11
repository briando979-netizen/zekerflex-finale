// ---------------------------------------------------------------------------
// De branches (soorten bedrijf) en wat ze nodig hebben. Een branche kiest uit de lijst modules (lib/branches/modules.ts);
// de rest volgt: het dashboard van het bedrijf, de matrix in het beheer en de bouwvolgorde. Een nieuwe branche is dus een
// stuk configuratie. Puur, met tests.
//
// "Wat een branche nodig heeft" is onze inschatting uit algemene kennis; die lijst toets je bij echte bedrijven. De dekking
// meet alleen hoeveel van onze eigen lijst er al staat, niet of de lijst volledig is.
// ---------------------------------------------------------------------------

import { KOPPELINGEN, MODULES, koppelingWerkt, moduleVan, type BrancheModule, type Koppeling } from "@/lib/branches/modules";

export interface Branche {
  sleutel: string;
  naam: string;
  /** voor wie, in één zin */
  voorWie: string;
  /** de modules die dit soort bedrijf nodig heeft, in de volgorde waarin ze op het dashboard komen */
  modules: readonly string[];
}

export const BRANCHES: readonly Branche[] = [
  {
    sleutel: "horeca",
    naam: "Horeca",
    voorWie: "Restaurants, cafés en lunchrooms.",
    modules: ["horeca-beheer", "flexwerk", "rooster", "inchecken", "uren", "facturen", "website", "kaart", "reviews", "netwerk", "op-locatie", "telefonie", "berichten"],
  },
  {
    sleutel: "rijschool",
    naam: "Rijschool",
    voorWie: "Rijscholen met instructeurs, leerlingen en een eigen auto.",
    modules: ["rijschool-beheer", "website", "kaart", "reviews", "berichten", "telefonie", "facturen"],
  },
  {
    sleutel: "winkel",
    naam: "Winkel",
    voorWie: "Winkels die ook online verkopen.",
    modules: ["webshop", "kassa-winkel", "website", "kaart", "reviews", "voorraad", "flexwerk", "rooster", "uren", "facturen", "netwerk"],
  },
  {
    sleutel: "kapper-schoonheid",
    naam: "Kapper en schoonheid",
    voorWie: "Kappers, schoonheidssalons en nagelstudio's.",
    modules: ["afspraken", "klantenkaart", "website", "kaart", "reviews", "berichten", "voorraad", "flexwerk", "rooster", "facturen"],
  },
  {
    sleutel: "sport-fitness",
    naam: "Sport en fitness",
    voorWie: "Sportscholen, studio's en trainers.",
    modules: ["lidmaatschappen", "afspraken", "klantenkaart", "website", "kaart", "reviews", "berichten", "flexwerk", "rooster", "facturen"],
  },
  {
    sleutel: "bouw-installatie",
    naam: "Bouw en installatie",
    voorWie: "Aannemers, installateurs en klusbedrijven, vaak met zzp'ers.",
    modules: ["werkbonnen", "offertes", "flexwerk", "uren", "certificaten", "voorraad", "facturen", "berichten", "telefonie", "website", "kaart"],
  },
  {
    sleutel: "schoonmaak",
    naam: "Schoonmaak",
    voorWie: "Schoonmaakbedrijven met vaste locaties en rondes.",
    modules: ["werkbonnen", "checklists", "flexwerk", "rooster", "inchecken", "uren", "certificaten", "facturen", "berichten"],
  },
  {
    sleutel: "transport-logistiek",
    naam: "Transport en logistiek",
    voorWie: "Transportbedrijven, koeriers en magazijnen.",
    modules: ["ritten", "flexwerk", "rooster", "inchecken", "uren", "certificaten", "op-locatie", "facturen", "telefonie"],
  },
  {
    sleutel: "evenementen",
    naam: "Evenementen",
    voorWie: "Organisatoren, cateraars en bureaus die tijdelijk veel mensen nodig hebben.",
    modules: ["flexwerk", "rooster", "inchecken", "uren", "certificaten", "offertes", "facturen", "website", "berichten"],
  },
  {
    sleutel: "hotel-verblijf",
    naam: "Hotel en verblijf",
    voorWie: "Hotels, B&B's en vakantieverhuur.",
    modules: ["kamers", "flexwerk", "rooster", "inchecken", "uren", "website", "kaart", "reviews", "netwerk", "facturen"],
  },
  {
    sleutel: "zorgpraktijk",
    naam: "Zorgpraktijk",
    voorWie: "Fysiotherapeuten, tandartsen en andere praktijken.",
    modules: ["afspraken", "dossier", "klantenkaart", "certificaten", "flexwerk", "rooster", "website", "berichten", "facturen"],
  },
  {
    sleutel: "uitzendbureau",
    naam: "Uitzendbureau",
    voorWie: "Bureaus die zelf mensen uitzenden.",
    modules: ["flexwerk", "rooster", "inchecken", "uren", "certificaten", "facturen", "rapportages", "berichten", "telefonie", "website"],
  },
];

const PER_SLEUTEL = new Map(BRANCHES.map((b) => [b.sleutel, b]));
export const brancheVan = (sleutel: string): Branche | undefined => PER_SLEUTEL.get(sleutel);
/** Een sleutel uit een adres: alleen een bekende branche telt (nooit `constructor`). */
export const isBranche = (s: unknown): s is string => typeof s === "string" && PER_SLEUTEL.has(s);

/** De modules van een branche, als echte modules. */
export function modulesVan(b: Branche): BrancheModule[] {
  return b.modules.map((s) => moduleVan(s)).filter((m): m is BrancheModule => m !== undefined);
}

export interface Dekking {
  klaar: number;
  totaal: number;
  /** 0–100, afgerond */
  procent: number;
}

/** Hoeveel van de lijst van deze branche er al staat. */
export function dekkingVan(b: Branche): Dekking {
  const lijst = modulesVan(b);
  const klaar = lijst.filter((m) => m.status === "klaar").length;
  return { klaar, totaal: lijst.length, procent: lijst.length === 0 ? 0 : Math.round((klaar / lijst.length) * 100) };
}

/** De koppelingen die voor deze branche gelden: beide kanten staan in zijn lijst. */
export function koppelingenVan(b: Branche): { koppeling: Koppeling; werkt: boolean }[] {
  const set = new Set(b.modules);
  return KOPPELINGEN.filter((k) => set.has(k.van) && set.has(k.naar)).map((k) => ({ koppeling: k, werkt: koppelingWerkt(k) }));
}

export interface BouwStap {
  module: BrancheModule;
  /** de branches die dit nodig hebben */
  branches: Branche[];
  /** hoeveel dekking die branches erbij krijgen als deze module er is, samen (procentpunten) */
  winst: number;
}

/**
 * Wat we hierna bouwen: de geplande modules, gesorteerd op hoeveel branches ze verder helpen. Eerst de module die voor de
 * meeste branches het gat dicht, bij gelijk aantal de grootste dekkingswinst. Zo beslist de lijst, niet de smaak.
 */
export function bouwvolgorde(): BouwStap[] {
  return MODULES.filter((m) => m.status === "gepland")
    .map((module) => {
      const branches = BRANCHES.filter((b) => b.modules.includes(module.sleutel));
      const winst = branches.reduce((som, b) => {
        const d = dekkingVan(b);
        return som + (d.totaal === 0 ? 0 : 100 / d.totaal);
      }, 0);
      return { module, branches, winst: Math.round(winst) };
    })
    .filter((s) => s.branches.length > 0)
    .sort((a, b) => b.branches.length - a.branches.length || b.winst - a.winst || a.module.sleutel.localeCompare(b.module.sleutel));
}

/** Het gemiddelde van de dekking over alle branches. */
export function gemiddeldeDekking(): number {
  if (BRANCHES.length === 0) return 0;
  return Math.round(BRANCHES.reduce((som, b) => som + dekkingVan(b).procent, 0) / BRANCHES.length);
}
