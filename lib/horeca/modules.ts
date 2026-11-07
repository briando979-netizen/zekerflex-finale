// ---------------------------------------------------------------------------
// De losse modules van het horeca-pakket en de bundel (het abonnement). De
// basis (eigen site met menukaart) zit er altijd in; een zaak zet modules aan
// of uit. Sommige modules hebben een andere nodig: bestellen via QR en
// afrekenen werken op het bestelscherm. Prijzen zijn VOORBEELDPRIJZEN: de
// eigenaar van ZekerFlex stelt de echte prijzen vast. Puur, dus ook in de
// browser bruikbaar en los te testen.
// ---------------------------------------------------------------------------

export const MODULE_SLEUTELS = ["reserveren", "bestellen", "qr", "kassa", "betalen", "taken", "personeel"] as const;
export type ModuleSleutel = (typeof MODULE_SLEUTELS)[number];

export interface Module {
  sleutel: ModuleSleutel;
  naam: string;
  kort: string;
  punten: string[];
  prijsCentPerMaand: number;
  /** extra uitleg bij de prijs, bv. kosten per betaling */
  prijsUitleg?: string;
  /** deze modules moeten ook aan staan */
  vereist: ModuleSleutel[];
  /** al te gebruiken; anders "binnenkort" en niet aan te zetten */
  klaar: boolean;
}

export const BASIS = {
  naam: "Basis",
  kort: "Eigen website met menukaart, openingstijden en contact",
  punten: ["Website in jullie eigen kleuren", "Menukaart met prijzen en allergenen", "Openingstijden en contact"],
  prijsCentPerMaand: 1900,
} as const;

export const MODULES: Record<ModuleSleutel, Module> = {
  reserveren: {
    sleutel: "reserveren",
    naam: "Reserveren",
    kort: "Gasten reserveren online een tafel; jullie hebben één reserveringsboek",
    punten: ["Vrije tijden live op de site", "Reserveringsboek per dag", "Telefonische reserveringen er zelf bij zetten"],
    prijsCentPerMaand: 1900,
    vereist: [],
    klaar: true,
  },
  bestellen: {
    sleutel: "bestellen",
    naam: "Bestellingen en keukenscherm",
    kort: "Bestellingen per tafel, direct op het scherm van keuken en bar",
    punten: ["Keuken- en barscherm met status", "Bediening voert zelf bestellingen in", "Volgnummer per bestelling"],
    prijsCentPerMaand: 1900,
    vereist: [],
    klaar: true,
  },
  qr: {
    sleutel: "qr",
    naam: "Bestellen aan tafel (QR)",
    kort: "Gasten scannen de QR-code op tafel en bestellen zelf van de menukaart",
    punten: ["QR-code per tafel om te printen", "Gast ziet direct wat er is en wat het kost", "Bestelling gaat meteen naar keuken of bar"],
    prijsCentPerMaand: 1900,
    vereist: ["bestellen"],
    klaar: true,
  },
  kassa: {
    sleutel: "kassa",
    naam: "Kassa",
    kort: "Afrekenen aan de kassa of met de handheld: pin, contant, splitsen, fooi en bon",
    punten: ["Rekening per tafel, splitsen gelijk of per gerecht", "Fooi, wisselgeld en een bon met btw-specificatie", "Snelle verkoop aan de bar of balie", "Dagafsluiting per betaalwijze en btw-tarief, als CSV voor de boekhouder"],
    prijsCentPerMaand: 1900,
    prijsUitleg: "pinnen gaat via je eigen pinautomaat",
    vereist: ["bestellen"],
    klaar: true,
  },
  betalen: {
    sleutel: "betalen",
    naam: "Afrekenen",
    kort: "Gasten rekenen aan tafel af met iDEAL; het geld gaat via Stripe direct naar jullie eigen rekening",
    punten: ["Afrekenen via de QR-code op tafel", "Fooi kiezen", "Elke betaling als bon in de kassa, met btw", "Uitbetaling vanzelf naar jullie bank via je eigen Stripe-account"],
    prijsCentPerMaand: 900,
    prijsUitleg: "plus de iDEAL-kosten per betaling (doorberekend, zonder marge)",
    vereist: ["bestellen", "qr"],
    klaar: true,
  },
  taken: {
    sleutel: "taken",
    naam: "Takenlijsten",
    kort: "Openings-, sluit- en HACCP-lijsten om per dag af te vinken",
    punten: ["Eigen lijsten per moment van de dag", "Temperaturen vastleggen", "Wie deed wat en wanneer"],
    prijsCentPerMaand: 900,
    vereist: [],
    klaar: true,
  },
  personeel: {
    sleutel: "personeel",
    naam: "Personeel via ZekerFlex",
    kort: "Flexkrachten inhuren voor drukke dagen, via het ZekerFlex-platform",
    punten: ["Diensten plaatsen vanuit het horecabeheer", "Geen vaste kosten"],
    prijsCentPerMaand: 0,
    prijsUitleg: "je betaalt alleen per gewerkt uur",
    vereist: [],
    klaar: true,
  },
};

/** Alles aan voor één maandbedrag: goedkoper dan de modules los. */
export const BUNDEL = { naam: "Alles-in-één", prijsCentPerMaand: 6900 } as const;

export const isModule = (s: string): s is ModuleSleutel => (MODULE_SLEUTELS as readonly string[]).includes(s);

/** Alleen geldige modules, in vaste volgorde, zonder dubbele. */
export const schoon = (modules: readonly string[]): ModuleSleutel[] => MODULE_SLEUTELS.filter((m) => modules.includes(m));

export const heeftModule = (zaak: { modules: readonly string[] }, m: ModuleSleutel) => zaak.modules.includes(m);

/**
 * Een module aan- of uitzetten. Aanzetten zet wat hij nodig heeft ook aan;
 * uitzetten zet wat erop rust ook uit (zonder bestelscherm geen QR-bestellen).
 */
export function zetModule(huidig: readonly string[], m: ModuleSleutel, aan: boolean): ModuleSleutel[] {
  const set = new Set(schoon(huidig));
  if (aan) {
    const erbij = (x: ModuleSleutel) => {
      set.add(x);
      MODULES[x].vereist.forEach(erbij);
    };
    erbij(m);
  } else {
    const eraf = (x: ModuleSleutel) => {
      set.delete(x);
      MODULE_SLEUTELS.filter((y) => set.has(y) && MODULES[y].vereist.includes(x)).forEach(eraf);
    };
    eraf(m);
  }
  return schoon([...set]);
}

/** Het maandbedrag: basis plus de modules, of de bundel als die goedkoper is. */
export function maandbedrag(modules: readonly string[]): { totaalCent: number; losCent: number; bundel: boolean } {
  const losCent = BASIS.prijsCentPerMaand + schoon(modules).reduce((s, m) => s + MODULES[m].prijsCentPerMaand, 0);
  const bundel = BUNDEL.prijsCentPerMaand < losCent;
  return { totaalCent: bundel ? BUNDEL.prijsCentPerMaand : losCent, losCent, bundel };
}
