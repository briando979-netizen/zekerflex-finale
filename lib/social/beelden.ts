// ---------------------------------------------------------------------------
// Beelden voor berichten: alleen onze eigen foto's uit public/ (Pexels License, bronnen in de
// CREDITS.md van elke map), zodat een bericht altijd een beeld kan krijgen zonder dat iemand er een
// hoeft te maken en zonder dat er een derde partij aan te pas komt. Puur (geen fs, geen prisma):
// tests/social-beelden.test.ts controleert dat elk bestand echt bestaat en een JPEG is (Instagram
// neemt alleen JPEG aan, met een beeldverhouding tussen 4:5 en 1,91:1).
// ---------------------------------------------------------------------------

import { FOTOS, FOTOTHEMA_NAAM, fotoPad } from "@/lib/marketing/fotos";

export interface Beeld {
  /** pad onder public/, met een slash vooraan */
  pad: string;
  label: string;
  /** woorden in een bericht waarbij deze foto past */
  trefwoorden: readonly string[];
  doelgroep: "werkgever" | "freelancer" | "beide";
}

const BASIS: readonly Beeld[] = [
  { pad: "/shifts/horeca.jpg", label: "Horeca", trefwoorden: ["horeca", "restaurant", "café", "cafe", "bar", "keuken", "bediening", "kok", "gast"], doelgroep: "beide" },
  { pad: "/shifts/retail.jpg", label: "Retail en winkel", trefwoorden: ["retail", "winkel", "supermarkt", "kassa", "vakkenvullen", "filiaal"], doelgroep: "beide" },
  { pad: "/shifts/logistiek.jpg", label: "Logistiek en magazijn", trefwoorden: ["logistiek", "magazijn", "pakket", "distributie", "orderpicker", "heftruck"], doelgroep: "beide" },
  { pad: "/shifts/bouw.jpg", label: "Bouw", trefwoorden: ["bouw", "timmer", "installatie", "techniek"], doelgroep: "beide" },
  { pad: "/shifts/zorg.jpg", label: "Zorg", trefwoorden: ["zorg", "verpleeg", "thuiszorg"], doelgroep: "beide" },
  { pad: "/shifts/schoonmaak.jpg", label: "Schoonmaak", trefwoorden: ["schoonmaak", "schoonmaker"], doelgroep: "beide" },
  { pad: "/shifts/evenement.jpg", label: "Evenementen", trefwoorden: ["evenement", "festival", "event", "steward", "wedstrijd"], doelgroep: "beide" },
  { pad: "/shifts/beveiliging.jpg", label: "Beveiliging", trefwoorden: ["beveiliging", "beveiliger", "portier"], doelgroep: "beide" },
  { pad: "/shifts/productie.jpg", label: "Productie", trefwoorden: ["productie", "fabriek", "assemblage"], doelgroep: "beide" },
  { pad: "/shifts/kantoor.jpg", label: "Kantoor", trefwoorden: ["kantoor", "administratie", "receptie"], doelgroep: "beide" },
  { pad: "/shifts/kinderopvang.jpg", label: "Kinderopvang", trefwoorden: ["kinderopvang", "bso", "opvang"], doelgroep: "beide" },
  { pad: "/shifts/auto.jpg", label: "Auto en techniek", trefwoorden: ["autobedrijf", "garage", "monteur", "chauffeur"], doelgroep: "beide" },
  { pad: "/shifts/agrarisch.jpg", label: "Agrarisch", trefwoorden: ["agrarisch", "tuinbouw", "kas", "oogst"], doelgroep: "beide" },
  { pad: "/shifts/promotie.jpg", label: "Promotie", trefwoorden: ["promotie", "promotor", "sampling"], doelgroep: "beide" },
  { pad: "/marketing/freelancer-at-work.jpg", label: "Flexwerker aan het werk", trefwoorden: ["flexwerker", "freelancer", "zzp", "klus"], doelgroep: "freelancer" },
  { pad: "/marketing/employer-branch.jpg", label: "Werkgever in de zaak", trefwoorden: ["werkgever", "personeel", "ondernemer"], doelgroep: "werkgever" },
  { pad: "/marketing/team-shift.jpg", label: "Team tijdens een dienst", trefwoorden: ["team", "dienst", "collega"], doelgroep: "werkgever" },
  { pad: "/aanbod/inchecken-op-locatie.jpg", label: "Inchecken op locatie", trefwoorden: ["inchecken", "check-in", "locatie", "gps"], doelgroep: "beide" },
  { pad: "/aanbod/spoedoproep.jpg", label: "Spoedoproep", trefwoorden: ["spoed", "uitval", "ziek", "last minute", "direct"], doelgroep: "werkgever" },
  { pad: "/aanbod/certificaten-in-een-foto.jpg", label: "Certificaten", trefwoorden: ["certificaat", "certificaten", "diploma", "vca"], doelgroep: "freelancer" },
  { pad: "/aanbod/bedrijfscheck.jpg", label: "Bedrijfscheck", trefwoorden: ["kvk", "btw", "bedrijfscheck", "dba"], doelgroep: "werkgever" },
];

/** Alles wat in de fotobibliotheek (lib/marketing/fotos.ts) staat, naast de bestaande foto's hierboven. */
export const BEELDEN: readonly Beeld[] = [
  ...BASIS,
  ...FOTOS.map((f): Beeld => ({ pad: fotoPad(f), label: `${FOTOTHEMA_NAAM[f.thema]}: ${f.alt}`, trefwoorden: f.trefwoorden, doelgroep: "beide" })),
];

/** Standaardfoto per doelgroep, voor een bericht zonder herkenbaar onderwerp. */
const STANDAARD: Record<"werkgever" | "freelancer" | "algemeen", string> = {
  werkgever: "/marketing/employer-branch.jpg",
  freelancer: "/marketing/freelancer-at-work.jpg",
  algemeen: "/marketing/team-shift.jpg",
};

/**
 * Kiest de foto die het best bij de tekst past: de meeste trefwoorden gaan voor; bij gelijkspel (of
 * niets) de volgende uit de rij `draai`, zodat opeenvolgende berichten niet steeds dezelfde foto krijgen.
 */
export function kiesBeeld(tekst: string, doelgroep: "werkgever" | "freelancer" | "algemeen", draai = 0): Beeld {
  const t = tekst.toLowerCase();
  const scores = BEELDEN.map((b) => ({ b, n: b.trefwoorden.filter((w) => t.includes(w)).length })).filter((x) => x.n > 0);
  if (scores.length > 0) {
    const max = Math.max(...scores.map((x) => x.n));
    const beste = scores.filter((x) => x.n === max);
    const gekozen = beste[draai % beste.length];
    if (gekozen) return gekozen.b;
  }
  const pool = BEELDEN.filter((b) => doelgroep === "algemeen" || b.doelgroep === "beide" || b.doelgroep === doelgroep);
  const eigen = BEELDEN.find((b) => b.pad === STANDAARD[doelgroep]);
  if (draai === 0 && eigen) return eigen;
  const k = pool[draai % pool.length];
  return k ?? BEELDEN[0]!;
}

/** Volledig https-adres van een foto, zoals Meta het moet kunnen ophalen. */
export function beeldAdres(pad: string, basis: string): string {
  return `${basis.replace(/\/$/, "")}${pad}`;
}
