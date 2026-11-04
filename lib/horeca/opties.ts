// ---------------------------------------------------------------------------
// Keuzes bij een gerecht: bakwijze, saus, extra's (met meerprijs). De zaak
// schrijft ze als gewone regels tekst, één groep per regel:
//   Bakwijze*: Rare, Medium, Well done        (* = verplicht, één keuze)
//   Saus: Pindasaus, Mayonaise                 (mag, één keuze)
//   Extra's+: Bacon (+1,50), Kaas (+1,00)      (+ = meer keuzes tegelijk)
// De gast of bediening kiest bij het bestellen; de keuze staat op de bon van
// keuken en bar en de meerprijs telt mee. De server controleert alles opnieuw.
// Puur, dus ook in de browser bruikbaar en los te testen.
// ---------------------------------------------------------------------------

export const MAX_GROEPEN = 8;
export const MAX_KEUZES = 15;

export interface Keuze {
  naam: string;
  /** meerprijs in cent (0 = geen) */
  prijsCent: number;
}

export interface OptieGroep {
  naam: string;
  keuzes: Keuze[];
  /** er moet iets gekozen worden */
  verplicht: boolean;
  /** meer dan één keuze tegelijk */
  meer: boolean;
}

/** Wat er gekozen is: per groep de namen van de keuzes. */
export interface Gekozen {
  groep: string;
  keuzes: string[];
}

const schoon = (s: string, max: number) => s.trim().replace(/\s+/g, " ").slice(0, max);
const centVan = (s: string): number => {
  const n = Number(s.replace(/[€\s+]/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
};

/** "Bacon (+1,50)" → { naam: "Bacon", prijsCent: 150 } */
function leesKeuze(deel: string): Keuze | null {
  const m = deel.match(/^(.*?)\s*\(\s*\+?\s*€?\s*(\d+(?:[.,]\d{1,2})?)\s*\)\s*$/);
  const naam = schoon(m ? (m[1] ?? "") : deel, 40);
  return naam ? { naam, prijsCent: m ? centVan(m[2] ?? "") : 0 } : null;
}

/** Splitst op komma's, maar niet binnen haakjes: "Kaas (+1,00), Ei" → ["Kaas (+1,00)", " Ei"]. */
function splitsBuitenHaakjes(s: string): string[] {
  const delen: string[] = [];
  let diepte = 0;
  let huidig = "";
  for (const t of s) {
    if (t === "(") diepte++;
    else if (t === ")") diepte = Math.max(0, diepte - 1);
    if (t === "," && diepte === 0) {
      delen.push(huidig);
      huidig = "";
    } else huidig += t;
  }
  return [...delen, huidig];
}

/** Eén regel tekst naar een groep, of null als er niets bruikbaars staat. */
export function leesGroepRegel(regel: string): OptieGroep | null {
  const i = regel.indexOf(":");
  if (i < 1) return null;
  let kop = regel.slice(0, i).trim();
  let verplicht = false;
  let meer = false;
  // tekens achter de naam: * verplicht, + meer keuzes (in elke volgorde)
  while (/[*+]$/.test(kop)) {
    if (kop.endsWith("*")) verplicht = true;
    else meer = true;
    kop = kop.slice(0, -1).trim();
  }
  const naam = schoon(kop, 40);
  const keuzes = splitsBuitenHaakjes(regel.slice(i + 1))
    .map(leesKeuze)
    .filter((k): k is Keuze => k !== null)
    .filter((k, j, alle) => alle.findIndex((x) => x.naam.toLowerCase() === k.naam.toLowerCase()) === j)
    .slice(0, MAX_KEUZES);
  return naam && keuzes.length ? { naam, keuzes, verplicht, meer } : null;
}

/** Het tekstvak (een groep per regel) naar groepen. */
export const leesOptieTekst = (tekst: string): OptieGroep[] =>
  tekst
    .split(/\r?\n/)
    .map(leesGroepRegel)
    .filter((g): g is OptieGroep => g !== null)
    .slice(0, MAX_GROEPEN);

const prijsTekst = (c: number) => `+${(c / 100).toFixed(2).replace(".", ",")}`;

/** Groepen terug naar tekst voor het tekstvak. */
export const optieTekst = (groepen: readonly OptieGroep[]) =>
  groepen.map((g) => `${g.naam}${g.verplicht ? "*" : ""}${g.meer ? "+" : ""}: ${g.keuzes.map((k) => (k.prijsCent ? `${k.naam} (${prijsTekst(k.prijsCent)})` : k.naam)).join(", ")}`).join("\n");

/** Groepen uit de database (Json) veilig terug. */
export function leesOpties(json: unknown): OptieGroep[] {
  if (!Array.isArray(json)) return [];
  return json
    .flatMap((g): OptieGroep[] => {
      if (!g || typeof g !== "object") return [];
      const x = g as Record<string, unknown>;
      if (typeof x.naam !== "string" || !Array.isArray(x.keuzes)) return [];
      const keuzes = x.keuzes.flatMap((k): Keuze[] => {
        const y = (k ?? {}) as Record<string, unknown>;
        return typeof y.naam === "string" && y.naam ? [{ naam: y.naam.slice(0, 40), prijsCent: typeof y.prijsCent === "number" && y.prijsCent > 0 ? Math.round(y.prijsCent) : 0 }] : [];
      });
      return keuzes.length ? [{ naam: x.naam.slice(0, 40), keuzes: keuzes.slice(0, MAX_KEUZES), verplicht: x.verplicht === true, meer: x.meer === true }] : [];
    })
    .slice(0, MAX_GROEPEN);
}

/**
 * Een keuze controleren tegen de groepen van het gerecht. Geeft de tekst voor
 * keuken en bon ("Medium · Bacon, Kaas") en de meerprijs, of een nette fout.
 */
export function kies(groepen: readonly OptieGroep[], gekozen: readonly Gekozen[], gerecht: string): { tekst: string; meerprijsCent: number } | { fout: string } {
  const delen: string[] = [];
  let meerprijsCent = 0;
  for (const g of gekozen) {
    if (!groepen.some((x) => x.naam === g.groep)) return { fout: `${gerecht}: de keuze "${g.groep}" bestaat niet (meer). Ververs de kaart.` };
  }
  for (const groep of groepen) {
    const namen = [...new Set(gekozen.find((x) => x.groep === groep.naam)?.keuzes ?? [])];
    if (groep.verplicht && namen.length === 0) return { fout: `Kies bij ${gerecht} een ${groep.naam.toLowerCase()}.` };
    if (!groep.meer && namen.length > 1) return { fout: `Kies bij ${gerecht} één ${groep.naam.toLowerCase()}.` };
    const keuzes = namen.map((n) => groep.keuzes.find((k) => k.naam === n));
    if (keuzes.some((k) => !k)) return { fout: `${gerecht}: een keuze bij ${groep.naam.toLowerCase()} bestaat niet (meer). Ververs de kaart.` };
    if (keuzes.length) {
      delen.push(keuzes.map((k) => k?.naam ?? "").join(", "));
      meerprijsCent += keuzes.reduce((s, k) => s + (k?.prijsCent ?? 0), 0);
    }
  }
  return { tekst: delen.join(" · "), meerprijsCent };
}

/** Heeft het gerecht keuzes waar de gast iets moet kiezen of kan kiezen? */
export const heeftOpties = (groepen: readonly OptieGroep[]) => groepen.length > 0;
