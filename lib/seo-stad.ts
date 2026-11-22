// ---------------------------------------------------------------------------
// Echte cijfers per stad voor de stadspagina's (branche × stad en /bijbaan/<stad>), 22 nov 2026.
//
// Aanleiding: de stadspagina's van één branche waren voor 64–70% gelijk (5-woordstukjes over de eerste 400 woorden) en
// Google koos voor de kleinere steden een andere canonieke of indexeerde ze niet. Nu krijgt elke stad een eigen blok
// met feiten uit het CBS (lib/seo-stad-cijfers.generated.ts, gemaakt door scripts/stad-cijfers.mjs), de steden die er
// het dichtst bij liggen, en vragen die door die cijfers gedragen worden. Geen verzonnen gegevens: geen aantallen open
// klussen of werkers, geen tarieven per stad. Wat we zelf uitrekenen (per 1.000 inwoners, aandeel, plaats in de lijst)
// staat er zo bij. Puur: geen database, geen fetch; de pagina's en de tests lezen hier allebei uit.
// ---------------------------------------------------------------------------

import { CITIES, type City } from "@/lib/seo-cities";
import { haversineMeters } from "@/lib/geo/geofencing";
import {
  CBS_TABELLEN,
  NEDERLAND_CIJFERS,
  STAD_CIJFERS,
  type Cijfer,
  type GemeenteVestigingen,
  type RegioVestigingen,
  type StadCijfers,
} from "@/lib/seo-stad-cijfers.generated";

export type { StadCijfers } from "@/lib/seo-stad-cijfers.generated";

export interface Link {
  href: string;
  label: string;
}

export function stadCijfers(slug: string): StadCijfers | undefined {
  return Object.hasOwn(STAD_CIJFERS, slug) ? STAD_CIJFERS[slug] : undefined;
}

// ---- getallen zoals je ze in het Nederlands schrijft ----------------------

/** 673804 → "673.804" */
export const getal = (n: number): string => String(Math.round(n)).replace(/\B(?=(\d{3})+$)/g, ".");
/** 6.248 → "6,2" */
export const komma = (x: number, decimalen = 1): string => x.toFixed(decimalen).replace(".", ",");
/** ["A", "B", "C"] → "A, B en C" */
export function opsomming(delen: readonly string[]): string {
  if (delen.length < 2) return delen.join("");
  return `${delen.slice(0, -1).join(", ")} en ${delen[delen.length - 1] ?? ""}`;
}

// ---- de gemeente ----------------------------------------------------------

/** Den Haag heet bij het CBS 's-Gravenhage: dezelfde gemeente onder haar officiële naam. */
const OFFICIELE_NAAM = new Set(["den-haag"]);

/** "de gemeente Rotterdam", "de gemeente Den Haag (bij het CBS: 's-Gravenhage)", "de gemeente Oldambt, waar Winschoten bij hoort". */
export function gemeenteVan(c: City, k: StadCijfers): string {
  if (k.gemeente === c.name) return `de gemeente ${c.name}`;
  if (OFFICIELE_NAAM.has(c.slug)) return `de gemeente ${c.name} (bij het CBS: ${k.gemeente})`;
  return `de gemeente ${k.gemeente}, waar ${c.name} bij hoort`;
}

/** Valt de plaats onder een gemeente met een andere naam (Hoogezand-Sappemeer → Midden-Groningen)? */
export const andereGemeente = (c: City, k: StadCijfers): boolean => k.gemeente !== c.name && !OFFICIELE_NAAM.has(c.slug);

/** Na "de gemeente Oldambt, waar Winschoten bij hoort" volgt in een zin een komma. */
const kommaNa = (c: City, k: StadCijfers): string => (andereGemeente(c, k) ? "," : "");

/** De naam waaronder de cijfers horen: de plaats, of de gemeente als die anders heet ("Midden-Groningen"). */
export const gemeenteNaam = (c: City, k: StadCijfers): string => (andereGemeente(c, k) ? k.gemeente : c.name);

// ---- afstand --------------------------------------------------------------

export interface Buur {
  city: City;
  /** hemelsbreed, afgerond op hele kilometers */
  km: number;
}

/** De steden uit lib/seo-cities.ts die hemelsbreed het dichtst bij liggen, dichtstbij eerst. */
export function dichtbij(c: City, aantal = 6): Buur[] {
  const hier = { latitude: c.lat, longitude: c.lng };
  return CITIES.filter((x) => x.slug !== c.slug)
    .map((x) => ({ city: x, km: Math.round(haversineMeters(hier, { latitude: x.lat, longitude: x.lng }) / 1000) }))
    .sort((a, b) => a.km - b.km || (a.city.slug < b.city.slug ? -1 : 1))
    .slice(0, aantal);
}

/** "Groningen (31 km)" */
export const buurLabel = (b: Buur): string => `${b.city.name} (${b.km} km)`;

// ---- welke cijfers bij welke branche --------------------------------------

export interface GemeenteMaat {
  niveau: "gemeente";
  sleutel: keyof GemeenteVestigingen;
  /** zoals in een zin met het aantal ervoor: "4.210 horecavestigingen" */
  naam: string;
  /** kort, voor "naar verhouding veel …" */
  kort: string;
  /** voor de tegel */
  tegel: string;
}
export interface RegioMaat {
  niveau: "regio";
  sleutel: keyof RegioVestigingen;
  naam: string;
  kort: string;
  tegel: string;
}
export type Maat = GemeenteMaat | RegioMaat;

// De omschrijvingen volgen de bedrijfstakken van het CBS (SBI 2008); "handel" is groot- én detailhandel, en
// schoonmaakbedrijven telt het CBS los alleen per COROP-gebied.
const MATEN = {
  horeca: { niveau: "gemeente", sleutel: "horeca", naam: "horecavestigingen", kort: "horecazaken", tegel: "horecavestigingen" },
  handel: { niveau: "gemeente", sleutel: "handel", naam: "vestigingen in de handel (groot- en detailhandel)", kort: "handelsbedrijven en winkels", tegel: "vestigingen in de handel" },
  vervoer: { niveau: "gemeente", sleutel: "vervoer", naam: "vestigingen in vervoer en opslag", kort: "vervoers- en opslagbedrijven", tegel: "vestigingen in vervoer en opslag" },
  zakelijk: {
    niveau: "gemeente",
    sleutel: "zakelijk",
    naam: "vestigingen in zakelijke diensten (daar vallen ook schoonmaakbedrijven onder)",
    kort: "zakelijke dienstverleners",
    tegel: "vestigingen in zakelijke diensten",
  },
  cultuur: { niveau: "gemeente", sleutel: "cultuur", naam: "vestigingen in cultuur, sport en recreatie", kort: "cultuur-, sport- en recreatiebedrijven", tegel: "vestigingen in cultuur, sport en recreatie" },
  totaal: { niveau: "gemeente", sleutel: "totaal", naam: "bedrijfsvestigingen", kort: "bedrijven", tegel: "bedrijfsvestigingen" },
  detailhandel: { niveau: "regio", sleutel: "detailhandel", naam: "vestigingen in de detailhandel", kort: "winkels en andere detailhandel", tegel: "vestigingen in de detailhandel" },
  opslag: {
    niveau: "regio",
    sleutel: "opslag",
    naam: "vestigingen in opslag en dienstverlening voor vervoer, waaronder distributiecentra",
    kort: "opslagbedrijven",
    tegel: "vestigingen in opslag en distributie",
  },
  koeriers: { niveau: "regio", sleutel: "koeriers", naam: "post- en koeriersbedrijven", kort: "post- en koeriersbedrijven", tegel: "post- en koeriersbedrijven" },
  schoonmaak: { niveau: "regio", sleutel: "schoonmaak", naam: "schoonmaakbedrijven", kort: "schoonmaakbedrijven", tegel: "schoonmaakbedrijven" },
  reclame: { niveau: "regio", sleutel: "reclame", naam: "vestigingen in reclame en marktonderzoek", kort: "reclame- en marktonderzoeksbureaus", tegel: "vestigingen in reclame en marktonderzoek" },
} as const satisfies Record<string, Maat>;

/** Per branche (sleutel uit lib/seo-sectors.ts, plus "bijbaan" en "algemeen") de cijfers die erbij horen, belangrijkste eerst. */
const PER_BRANCHE: Record<string, readonly Maat[]> = {
  horeca: [MATEN.horeca],
  logistiek: [MATEN.vervoer, MATEN.opslag],
  schoonmaak: [MATEN.schoonmaak, MATEN.zakelijk],
  evenementen: [MATEN.cultuur, MATEN.horeca],
  retail: [MATEN.handel, MATEN.detailhandel],
  promotie: [MATEN.reclame, MATEN.handel],
  bezorging: [MATEN.koeriers, MATEN.vervoer],
  bijbaan: [MATEN.horeca, MATEN.handel],
  algemeen: [MATEN.totaal],
};

export function matenVoor(branche: string): readonly Maat[] {
  return Object.hasOwn(PER_BRANCHE, branche) ? (PER_BRANCHE[branche] ?? []) : [];
}

export function waardeVan(m: Maat, k: Pick<StadCijfers, "vestigingen" | "regio">): Cijfer {
  return m.niveau === "gemeente" ? k.vestigingen[m.sleutel] : k.regio[m.sleutel];
}

/** Vestigingen per 1.000 inwoners van de gemeente (of van heel Nederland). */
export function per1000(m: GemeenteMaat, k: Pick<StadCijfers, "vestigingen" | "inwoners">): number {
  return (k.vestigingen[m.sleutel].n / k.inwoners.n) * 1000;
}

/** De plaats van de stad (1 = de hoogste) van alle steden met cijfers, per 1.000 inwoners. */
export function plaatsVan(m: GemeenteMaat, slug: string): { plaats: number; van: number } {
  const lijst = CITIES.flatMap((c) => {
    const k = stadCijfers(c.slug);
    return k ? [{ slug: c.slug, p: per1000(m, k) }] : [];
  }).sort((a, b) => b.p - a.p);
  return { plaats: lijst.findIndex((x) => x.slug === slug) + 1, van: lijst.length };
}

type Stand = "hoog" | "gemiddeld" | "laag";
const standVan = (verhouding: number): Stand => (verhouding >= 1.05 ? "hoog" : verhouding > 0.95 ? "gemiddeld" : "laag");
function vergelijk(verhouding: number): string {
  if (verhouding >= 1.25) return "ruim boven";
  if (verhouding >= 1.05) return "boven";
  if (verhouding > 0.95) return "ongeveer gelijk aan";
  if (verhouding > 0.75) return "onder";
  return "ruim onder";
}
function plaatsZin({ plaats, van }: { plaats: number; van: number }): string {
  if (plaats === 1) return `Per inwoner is dat het hoogste van de ${van} steden op deze site.`;
  if (plaats === van) return `Per inwoner is dat het laagste van de ${van} steden op deze site.`;
  return `Per inwoner: plaats ${plaats} van de ${van} steden op deze site.`;
}

const eersteGemeenteMaat = (maten: readonly Maat[]): GemeenteMaat | undefined => maten.find((m): m is GemeenteMaat => m.niveau === "gemeente");

/** De andere steden uit de lijst in hetzelfde COROP-gebied. */
function zelfdeRegio(c: City, k: StadCijfers): string[] {
  return CITIES.filter((x) => x.slug !== c.slug && stadCijfers(x.slug)?.coropCode === k.coropCode).map((x) => x.name);
}

// ---- de bronnen -----------------------------------------------------------

export interface Bron {
  tabel: string;
  titel: string;
  href: string;
}

export const bronUrl = (tabel: string): string => `https://opendata.cbs.nl/statline/#/CBS/nl/dataset/${tabel}/table`;

function bronVan(tabel: string): Bron {
  const t = Object.hasOwn(CBS_TABELLEN, tabel) ? CBS_TABELLEN[tabel] : undefined;
  return { tabel, titel: t ? `${t.titel} (${t.jaar}${t.voorlopig ? ", voorlopig" : ""})` : tabel, href: bronUrl(tabel) };
}

/** De tabel met de indeling in gemeenten en COROP-gebieden (Gebieden in Nederland <jaar>). */
const GEBIEDEN = Object.keys(CBS_TABELLEN).find((t) => CBS_TABELLEN[t]?.titel.startsWith("Gebieden in Nederland"));

// ---- het blok met cijfers -------------------------------------------------

export type Kant = "werker" | "bedrijf" | "bijbaan";

export interface CijferRij {
  label: string;
  aantal: string;
  per1000: string;
}

export interface CijferBlok {
  kop: string;
  tegels: { waarde: string; label: string }[];
  alineas: string[];
  /** alle bedrijfstakken die het CBS per gemeente telt, meeste eerst */
  tabel: { kop: string; kolommen: readonly string[]; rijen: CijferRij[] };
  bronnen: Bron[];
  bronTekst: string;
}

export const TABEL_KOLOMMEN = ["Bedrijfstak", "Vestigingen", "Per 1.000 inwoners"] as const;

/** De bedrijfstakken die het CBS per gemeente telt, met een korte naam voor de tabel. */
const TABEL: readonly [GemeenteMaat, string][] = [
  [MATEN.horeca, "Horeca"],
  [MATEN.handel, "Handel (groot- en detailhandel)"],
  [MATEN.vervoer, "Vervoer en opslag"],
  [MATEN.zakelijk, "Zakelijke diensten (o.a. schoonmaak)"],
  [MATEN.cultuur, "Cultuur, sport en recreatie"],
];

/** "4.185 → 4.210: 25 meer (+0,6 procent)" als zin, voor dezelfde bedrijfstak een jaar eerder. */
function trendZin(m: GemeenteMaat, k: StadCijfers): string {
  const nu = k.vestigingen[m.sleutel];
  const toen = k.vestigingenVorig[m.sleutel];
  const verschil = nu.n - toen.n;
  const pct = toen.n > 0 ? (verschil / toen.n) * 100 : 0;
  const hoe = verschil > 0 ? `${getal(verschil)} meer (+${komma(pct)} procent)` : verschil < 0 ? `${getal(-verschil)} minder (${komma(pct)} procent)` : "evenveel";
  return `Een jaar eerder, op 1 januari ${toen.jaar}, waren het er ${getal(toen.n)}: nu ${hoe}.`;
}

/**
 * Het blok "<branche> in <stad> in cijfers": inwoners, de vestigingen van de branche (per 1.000 inwoners tegen het
 * landelijk gemiddelde, en de plaats tussen onze steden), het COROP-gebied, en wat dat betekent voor wie daar werk
 * zoekt of personeel nodig heeft. `wie` is de kracht in de zin voor werkers ("horecakracht").
 */
export function cijferBlok(c: City, branche: string, kant: Kant, kop: string, wie = "flexwerker"): CijferBlok | null {
  const k = stadCijfers(c.slug);
  const maten = matenVoor(branche);
  if (!k || maten.length === 0) return null;
  const nl = NEDERLAND_CIJFERS;
  const gem = gemeenteVan(c, k);
  const buren = dichtbij(c, 2);
  const [b1, b2] = buren;
  const alineas: string[] = [];

  const jongPct = (k.jongeren.n / k.inwoners.n) * 100;
  const nlJongPct = (nl.jongeren.n / nl.inwoners.n) * 100;
  alineas.push(
    kant === "bijbaan"
      ? `In ${gem}${kommaNa(c, k)} woonden op 1 januari ${k.inwoners.jaar} ${getal(k.inwoners.n)} mensen. Van hen waren er ${getal(k.jongeren.n)} van 18 tot en met 24 jaar: ${komma(jongPct)} procent, tegen ${komma(nlJongPct)} procent in heel Nederland.`
      : `In ${gem}${kommaNa(c, k)} woonden op 1 januari ${k.inwoners.jaar} ${getal(k.inwoners.n)} mensen, van wie ${getal(k.jongeren.n)} van 18 tot en met 24 jaar. Het CBS noemt de gemeente ${k.stedelijkheid}.`,
  );

  let gemeenteGehad = false;
  for (const m of maten) {
    const w = waardeVan(m, k);
    if (m.niveau === "gemeente") {
      const p = per1000(m, k);
      const pnl = per1000(m, nl);
      if (gemeenteGehad) {
        alineas.push(`Daarnaast waren er ${getal(w.n)} ${m.naam}, ${komma(p)} per 1.000 inwoners (landelijk ${komma(pnl)}).`);
      } else {
        alineas.push(
          `Op 1 januari ${w.jaar} telde het CBS in ${gemeenteNaam(c, k)} ${getal(w.n)} ${m.naam}: ${komma(p)} per 1.000 inwoners, ${vergelijk(p / pnl)} het landelijk gemiddelde van ${komma(pnl)}. ${plaatsZin(plaatsVan(m, c.slug))} ${trendZin(m, k)}`,
        );
        // de buren met hetzelfde cijfer: namen en getallen, dus op elke pagina anders
        const vergeleken = dichtbij(c, 3).flatMap((b) => {
          const kb = stadCijfers(b.city.slug);
          return kb ? [`${gemeenteNaam(b.city, kb)} ${komma(per1000(m, kb))}`] : [];
        });
        if (vergeleken.length) alineas.push(`Ter vergelijking, per 1.000 inwoners: ${vergeleken.join("; ")}.`);
      }
      gemeenteGehad = true;
    } else {
      const zelfde = zelfdeRegio(c, k);
      const aandeel = (w.n / nl.regio[m.sleutel].n) * 100;
      alineas.push(
        `In het COROP-gebied ${k.corop}${zelfde.length ? `, met ook ${opsomming(zelfde)},` : ""} zijn ${getal(w.n)} ${m.naam}: ${komma(aandeel)} procent van Nederland.`,
      );
    }
  }

  const g = eersteGemeenteMaat(maten);
  if (g) {
    const stand = standVan(per1000(g, k) / per1000(g, nl));
    const verder = b1 && b2 ? `${buurLabel(b1)} en ${buurLabel(b2)}` : b1 ? buurLabel(b1) : "de steden in de buurt";
    alineas.push(betekenis(kant, stand, c.name, g.kort, wie, verder));
  }

  const tegels: CijferBlok["tegels"] = [
    { waarde: getal(k.inwoners.n), label: `inwoners in ${andereGemeente(c, k) ? `gemeente ${k.gemeente}` : "de gemeente"}` },
  ];
  if (kant === "bijbaan") tegels.push({ waarde: getal(k.jongeren.n), label: `van 18 tot en met 24 jaar (${komma(jongPct)} procent)` });
  const eerste = maten[0];
  if (eerste) tegels.push({ waarde: getal(waardeVan(eerste, k).n), label: eerste.niveau === "regio" ? `${eerste.tegel} in ${k.corop}` : eerste.tegel });
  if (g && tegels.length < 3) tegels.push({ waarde: komma(per1000(g, k)), label: `${g === eerste ? "" : `${g.tegel} `}per 1.000 inwoners (landelijk ${komma(per1000(g, nl))})` });

  const tabellen = [k.inwoners.tabel, ...maten.map((m) => waardeVan(m, k).tabel), ...(GEBIEDEN ? [GEBIEDEN] : [])];
  const voorlopig = maten.some((m) => waardeVan(m, k).voorlopig);
  const jaar = waardeVan(eerste ?? MATEN.totaal, k).jaar;
  const rijen = TABEL.map(([m, label]) => ({ label, n: k.vestigingen[m.sleutel].n, p: per1000(m, k) }))
    .sort((a, b) => b.n - a.n)
    .map((r) => ({ label: r.label, aantal: getal(r.n), per1000: komma(r.p) }));
  return {
    kop,
    tegels,
    alineas,
    tabel: { kop: `Vestigingen in ${gemeenteNaam(c, k)} per bedrijfstak`, kolommen: TABEL_KOLOMMEN, rijen },
    bronnen: [...new Set(tabellen)].map(bronVan),
    bronTekst: `Bron: CBS StatLine, 1 januari ${jaar}${voorlopig ? " (vestigingen voorlopig)" : ""}; per 1.000 inwoners: eigen berekening.`,
  };
}

function betekenis(kant: Kant, stand: Stand, stad: string, kort: string, wie: string, verder: string): string {
  if (kant === "bedrijf") {
    if (stand === "hoog") return `Veel ${kort} in ${stad} zoeken op dezelfde drukke momenten extra handen: plaats je klus op tijd.`;
    if (stand === "gemiddeld") return `Een gemiddeld beeld voor ${stad}; je klus gaat ook naar krachten net buiten de gemeente.`;
    return `Minder ${kort} in ${stad} betekent ook minder concurrentie om dezelfde mensen.`;
  }
  const voor = kant === "bijbaan" ? "een bijbaan" : `werk als ${wie}`;
  if (stand === "hoog") return `Voor ${voor} in ${stad}: veel ${kort}, dus veel plekken die op drukke momenten extra mensen kunnen zoeken.`;
  if (stand === "gemiddeld") return `Voor ${voor} in ${stad}: een gemiddeld aantal ${kort}. Kijk ook in ${verder}.`;
  return `Minder ${kort} dan gemiddeld: zoek je ${voor} in ${stad}, kijk dan ook in ${verder}.`;
}

// ---- vragen die door de cijfers gedragen worden ----------------------------

export interface Vraag {
  q: string;
  a: string;
}

/** "Hoeveel horecazaken zijn er in Rotterdam?" met het antwoord uit het CBS. */
export function aantalVraag(c: City, branche: string): Vraag | null {
  const k = stadCijfers(c.slug);
  const m = matenVoor(branche)[0];
  if (!k || !m) return null;
  const w = waardeVan(m, k);
  const waar = m.niveau === "regio" ? `het COROP-gebied ${k.corop}, waar ${c.name} in ligt` : gemeenteVan(c, k);
  const extra =
    m.niveau === "gemeente"
      ? ` Dat is ${komma(per1000(m, k))} per 1.000 inwoners; in heel Nederland ${komma(per1000(m, NEDERLAND_CIJFERS))}.`
      : ` Een kleiner gebied dan het COROP-gebied telt het CBS voor deze bedrijfstak niet.`;
  return {
    q: `Hoeveel ${m.kort} zijn er in ${c.name}?`,
    a: `Volgens het CBS waren er op 1 januari ${w.jaar} ${getal(w.n)} ${m.naam} in ${waar}${w.voorlopig ? " (voorlopig cijfer)" : ""}.${extra}`,
  };
}

/** "Welke steden liggen dicht bij Rotterdam?" met de afstand hemelsbreed. */
export function burenVraag(c: City, kant: Kant): Vraag {
  const b = dichtbij(c, 3).map(buurLabel);
  const slot = kant === "bedrijf" ? "Je klus gaat naar krachten binnen reisafstand van je locatie." : "Bij elke dienst zie je hoe lang je reist.";
  return { q: `Welke steden liggen dicht bij ${c.name}?`, a: `Hemelsbreed het dichtst bij liggen ${opsomming(b)}. ${slot}` };
}

/** "Kan ik in Breda ook studenten inhuren?" met het aantal inwoners van 18 tot en met 24 jaar. */
export function studentenVraag(c: City): Vraag | null {
  const k = stadCijfers(c.slug);
  if (!k) return null;
  return {
    q: `Kan ik in ${c.name} ook studenten inhuren?`,
    a: `Ja. In ${gemeenteVan(c, k)}${kommaNa(c, k)} wonen ${getal(k.jongeren.n)} mensen van 18 tot en met 24 jaar (CBS, 1 januari ${k.jongeren.jaar}). Studenten vanaf 18 melden zich aan als zzp'er of werken als uitzendkracht via een aangesloten uitzendbureau, en kiezen zelf hun diensten. Je ziet wie er reageert en kiest zelf wie je inroostert.`,
  };
}

/** "Hoeveel jongeren wonen er in Groningen?" voor de bijbaanpagina's. */
export function jongerenVraag(c: City): Vraag | null {
  const k = stadCijfers(c.slug);
  if (!k) return null;
  const pct = (k.jongeren.n / k.inwoners.n) * 100;
  const nlPct = (NEDERLAND_CIJFERS.jongeren.n / NEDERLAND_CIJFERS.inwoners.n) * 100;
  return {
    q: `Hoeveel jongeren wonen er in ${c.name}?`,
    a: `Op 1 januari ${k.jongeren.jaar} woonden er ${getal(k.jongeren.n)} mensen van 18 tot en met 24 jaar in ${gemeenteVan(c, k)}, ${komma(pct)} procent van alle inwoners. In heel Nederland is dat ${komma(nlPct)} procent (CBS).`,
  };
}

// ---- gelijkenis tussen twee pagina's ---------------------------------------

/** De woorden van een tekst, klein en zonder leestekens; een getal ("4.210", "6,2") blijft één woord. */
export function woorden(tekst: string): string[] {
  return tekst
    .toLowerCase()
    .replace(/(\d)[.,](?=\d)/g, "$1")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter(Boolean);
}

/**
 * Hoe gelijk twee pagina's zijn zoals in de meting van 22 nov 2026: Jaccard over de 5-woordstukjes van de eerste 400
 * woorden. 0 = niets gemeen, 1 = gelijk.
 */
export function gelijkenis(a: string, b: string, { max = 400, n = 5 }: { max?: number; n?: number } = {}): number {
  const stukjes = (t: string): Set<string> => {
    const w = woorden(t).slice(0, max);
    const uit = new Set<string>();
    for (let i = 0; i + n <= w.length; i++) uit.add(w.slice(i, i + n).join(" "));
    return uit;
  };
  const A = stukjes(a);
  const B = stukjes(b);
  if (A.size === 0 && B.size === 0) return 1;
  let samen = 0;
  for (const s of A) if (B.has(s)) samen++;
  return samen / (A.size + B.size - samen);
}
