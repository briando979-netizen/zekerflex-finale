import { stem } from "@/lib/rag/lexical";

// ---------------------------------------------------------------------------
// Rekenwerk van de Kennisgraaf, zonder database of corpus: begrippen uit tekst
// (TF-IDF), samenhangende delen (clusters), gemeenschappen (thema's, label-
// propagatie), PageRank (welk document is het meest centraal), tussenligging
// (welke documenten zijn de bruggen), kortste pad, buurt, netwerkcijfers,
// hiaten en brugsuggesties, exports (GraphML, DOT, CSV, rapport) en het
// verschil tussen twee momentopnamen. Puur, dus testbaar en ook in client-code
// bruikbaar; de graaf zelf staat in lib/rag/graph.ts.
// ---------------------------------------------------------------------------

export type LijnSoort = "begrippen" | "semantisch" | "begrip";

export interface GraafKnoop {
  id: string;
  label: string;
  /** intern, kennisbank, blog, whitepaper, faq, wet-dba, help, howto, begrip, overig */
  group: string;
  /** documenten: aantal passages; begrippen: aantal documenten waarin het begrip zwaar weegt */
  size: number;
  href?: string;
  /** het thema (gemeenschap, 1-based) waar de knoop bij hoort; begrippen: het thema van de meeste van hun documenten */
  thema?: number;
}

export interface GraafLijn {
  source: string;
  target: string;
  weight: number;
  soort: LijnSoort;
}

export interface Begrip {
  id: string;
  label: string;
  /** TF-IDF-gewicht over het hele corpus */
  gewicht: number;
  docs: { docId: string; gewicht: number }[];
}

type Lijn = { source: string; target: string; weight: number };

const STOP = new Set(
  (
    "de het een en van is in op voor je jij ik dat dit hoe wat wanneer waar waarom wie kan kun kunnen met als niet ook of aan zijn er bij naar dan zo " +
    "maar deze die worden word wordt om te tot heb hebt heeft nog wel geen mijn jouw uw hun me mij we wij ze zij hij u moet moeten mag mogen wil " +
    "dus daar hier over onder door uit naar meer minder alle alles altijd nooit zonder omdat zodat want toch echter bijvoorbeeld daarna daarvoor " +
    "zoals binnen buiten tegen tussen vanaf sinds steeds iedere elke ander andere eigen zelf veel weinig ongeveer vaak soms eerst later direct " +
    "the and for with you your are this that from into has have will not can per via"
  ).split(" "),
);

/** Woorden van vier letters of meer, zonder stopwoorden; stam → meest voorkomende schrijfwijze. */
function woorden(text: string): { stammen: string[]; vormen: Map<string, Map<string, number>> } {
  const stammen: string[] = [];
  const vormen = new Map<string, Map<string, number>>();
  const ruw = text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").match(/\p{L}{4,}/gu) ?? [];
  for (const w of ruw) {
    if (STOP.has(w)) continue;
    const s = stem(w);
    if (s.length < 4) continue;
    stammen.push(s);
    const m = vormen.get(s) ?? new Map<string, number>();
    m.set(w, (m.get(w) ?? 0) + 1);
    vormen.set(s, m);
  }
  return { stammen, vormen };
}

/**
 * De begrippen die het corpus dragen: per document TF-IDF, over alles opgeteld.
 * Een begrip krijgt de documenten waarin het bij de bovenste `perDoc` termen hoort.
 */
export function conceptenUit(docs: { id: string; text: string }[], max = 40, perDoc = 8): Begrip[] {
  const n = docs.length;
  if (n === 0) return [];
  const tfs: Map<string, number>[] = [];
  const df = new Map<string, number>();
  const vormen = new Map<string, Map<string, number>>();
  for (const d of docs) {
    const w = woorden(d.text);
    const tf = new Map<string, number>();
    for (const s of w.stammen) tf.set(s, (tf.get(s) ?? 0) + 1);
    for (const s of tf.keys()) df.set(s, (df.get(s) ?? 0) + 1);
    for (const [s, m] of w.vormen) {
      const all = vormen.get(s) ?? new Map<string, number>();
      for (const [vorm, c] of m) all.set(vorm, (all.get(vorm) ?? 0) + c);
      vormen.set(s, all);
    }
    tfs.push(tf);
  }
  const idf = (s: string) => Math.log(1 + n / (df.get(s) ?? 1));
  // per document de sterkste termen
  const perDocTop: { stam: string; w: number }[][] = tfs.map((tf) => {
    const lengte = [...tf.values()].reduce((a, b) => a + b, 0) || 1;
    return [...tf]
      .map(([stam, c]) => ({ stam, w: (c / lengte) * idf(stam) }))
      .sort((a, b) => b.w - a.w)
      .slice(0, perDoc);
  });
  // een begrip moet in minstens twee documenten zwaar wegen, anders is het een eigenaardigheid van één tekst
  const totaal = new Map<string, { gewicht: number; docs: { docId: string; gewicht: number }[] }>();
  perDocTop.forEach((lijst, i) => {
    for (const { stam, w } of lijst) {
      const t = totaal.get(stam) ?? { gewicht: 0, docs: [] };
      t.gewicht += w;
      t.docs.push({ docId: docs[i]!.id, gewicht: Math.round(w * 1000) / 1000 });
      totaal.set(stam, t);
    }
  });
  const label = (stam: string) => {
    const m = vormen.get(stam);
    if (!m) return stam;
    return [...m].sort((a, b) => b[1] - a[1])[0]?.[0] ?? stam;
  };
  return [...totaal]
    .filter(([, t]) => t.docs.length >= 2)
    .sort((a, b) => b[1].gewicht - a[1].gewicht)
    .slice(0, max)
    .map(([stam, t]) => ({ id: `begrip:${stam}`, label: label(stam), gewicht: Math.round(t.gewicht * 1000) / 1000, docs: t.docs.sort((a, b) => b.gewicht - a.gewicht) }));
}

/** Buren per knoop (ongericht, gewogen); lijnen naar onbekende knopen en lussen tellen niet. */
function burenVan(ids: string[], lijnen: Lijn[]): Map<string, { id: string; w: number }[]> {
  const buren = new Map<string, { id: string; w: number }[]>(ids.map((id) => [id, []]));
  for (const l of lijnen) {
    if (l.source === l.target || l.weight <= 0) continue;
    const a = buren.get(l.source);
    const b = buren.get(l.target);
    if (!a || !b) continue;
    a.push({ id: l.target, w: l.weight });
    b.push({ id: l.source, w: l.weight });
  }
  return buren;
}

/** Samenhangende delen (union-find), grootste eerst. */
export function verbondenDelen(ids: string[], lijnen: { source: string; target: string }[]): string[][] {
  const ouder = new Map<string, string>(ids.map((id) => [id, id]));
  const vind = (x: string): string => {
    let r = x;
    while (ouder.get(r) !== r) r = ouder.get(r) ?? r;
    // padcompressie
    let c = x;
    while (ouder.get(c) !== r) {
      const volgende = ouder.get(c) ?? r;
      ouder.set(c, r);
      c = volgende;
    }
    return r;
  };
  for (const l of lijnen) {
    if (!ouder.has(l.source) || !ouder.has(l.target)) continue;
    const a = vind(l.source);
    const b = vind(l.target);
    if (a !== b) ouder.set(a, b);
  }
  const groepen = new Map<string, string[]>();
  for (const id of ids) {
    const r = vind(id);
    groepen.set(r, [...(groepen.get(r) ?? []), id]);
  }
  return [...groepen.values()].sort((a, b) => b.length - a.length || (a[0] ?? "").localeCompare(b[0] ?? ""));
}

/**
 * Gemeenschappen (thema's) met gewogen labelpropagatie: elke knoop neemt het label dat bij zijn buren het zwaarst weegt,
 * tot niets meer verandert (of na `rondes`). Deterministisch: knopen op alfabet, gelijkspel → het kleinste label.
 * Anders dan `verbondenDelen` splitst dit ook het grote samenhangende deel in dichte groepen. Grootste eerst.
 */
export function gemeenschappen(ids: string[], lijnen: Lijn[], rondes = 30): string[][] {
  const volgorde = [...ids].sort();
  const buren = burenVan(volgorde, lijnen);
  const label = new Map<string, string>(volgorde.map((id) => [id, id]));
  for (let r = 0; r < rondes; r++) {
    let veranderd = false;
    for (const id of volgorde) {
      const b = buren.get(id) ?? [];
      if (b.length === 0) continue;
      const som = new Map<string, number>();
      for (const x of b) {
        const l = label.get(x.id) ?? x.id;
        som.set(l, (som.get(l) ?? 0) + x.w);
      }
      const eigen = label.get(id) ?? id;
      let best = eigen;
      let bestW = -1;
      for (const [l, w] of [...som].sort((x, y) => x[0].localeCompare(y[0]))) {
        if (w > bestW + 1e-9) {
          best = l;
          bestW = w;
        }
      }
      if (best !== eigen) {
        label.set(id, best);
        veranderd = true;
      }
    }
    if (!veranderd) break;
  }
  const groepen = new Map<string, string[]>();
  for (const id of ids) {
    const l = label.get(id) ?? id;
    groepen.set(l, [...(groepen.get(l) ?? []), id]);
  }
  return [...groepen.values()].sort((a, b) => b.length - a.length || (a[0] ?? "").localeCompare(b[0] ?? ""));
}

/** Modulariteit (Newman) van een indeling: hoeveel meer lijnen binnen de groepen vallen dan toeval; 0 = niets, ±0,3 of hoger is een echte structuur. */
export function modulariteit(ids: string[], lijnen: Lijn[], groepen: string[][]): number {
  const groepVan = new Map<string, number>();
  groepen.forEach((g, i) => g.forEach((id) => groepVan.set(id, i)));
  const bekend = new Set(ids);
  const geldig = lijnen.filter((l) => bekend.has(l.source) && bekend.has(l.target) && groepVan.has(l.source) && groepVan.has(l.target) && l.weight > 0 && l.source !== l.target);
  let m = 0;
  let binnen = 0;
  const graad = new Map<string, number>();
  for (const l of geldig) {
    m += l.weight;
    graad.set(l.source, (graad.get(l.source) ?? 0) + l.weight);
    graad.set(l.target, (graad.get(l.target) ?? 0) + l.weight);
    if (groepVan.get(l.source) === groepVan.get(l.target)) binnen += l.weight;
  }
  if (m === 0) return 0;
  const perGroep = new Map<number, number>();
  for (const [id, k] of graad) {
    const gi = groepVan.get(id);
    if (gi !== undefined) perGroep.set(gi, (perGroep.get(gi) ?? 0) + k);
  }
  let verwacht = 0;
  for (const k of perGroep.values()) verwacht += (k / (2 * m)) ** 2;
  return Math.round((binnen / m - verwacht) * 1000) / 1000;
}

/**
 * Tussenligging (betweenness, Brandes): op hoeveel kortste paden (in stappen) een knoop ligt, genormaliseerd op 0–1.
 * Hoog = een brug tussen delen van de kennis: valt zo'n document weg, dan raken thema's elkaar niet meer.
 */
export function tussenligging(ids: string[], lijnen: Lijn[]): Map<string, number> {
  const buren = burenVan(ids, lijnen);
  const cb = new Map<string, number>(ids.map((id) => [id, 0]));
  for (const s of ids) {
    const stapel: string[] = [];
    const voorgangers = new Map<string, string[]>();
    const sigma = new Map<string, number>();
    const afstand = new Map<string, number>();
    for (const v of ids) {
      voorgangers.set(v, []);
      sigma.set(v, 0);
      afstand.set(v, -1);
    }
    sigma.set(s, 1);
    afstand.set(s, 0);
    const rij = [s];
    let kop = 0;
    while (kop < rij.length) {
      const v = rij[kop++]!;
      stapel.push(v);
      const dv = afstand.get(v) ?? 0;
      for (const { id: w } of buren.get(v) ?? []) {
        if (afstand.get(w) === -1) {
          rij.push(w);
          afstand.set(w, dv + 1);
        }
        if (afstand.get(w) === dv + 1) {
          sigma.set(w, (sigma.get(w) ?? 0) + (sigma.get(v) ?? 0));
          voorgangers.get(w)?.push(v);
        }
      }
    }
    const delta = new Map<string, number>(ids.map((id) => [id, 0]));
    while (stapel.length > 0) {
      const w = stapel.pop()!;
      const sw = sigma.get(w) || 1;
      for (const v of voorgangers.get(w) ?? []) delta.set(v, (delta.get(v) ?? 0) + ((sigma.get(v) ?? 0) / sw) * (1 + (delta.get(w) ?? 0)));
      if (w !== s) cb.set(w, (cb.get(w) ?? 0) + (delta.get(w) ?? 0));
    }
  }
  // ongericht: elk pad twee keer geteld; genormaliseerd op het aantal paren zonder de knoop zelf
  const n = ids.length;
  const norm = n > 2 ? (n - 1) * (n - 2) : 1;
  for (const [id, v] of cb) cb.set(id, Math.round((v / norm) * 10000) / 10000);
  return cb;
}

/** Kortste pad (Dijkstra; een sterke lijn is een korte stap: kosten 1/gewicht). Null als er geen pad is. */
export function kortstePad(ids: string[], lijnen: Lijn[], van: string, naar: string): string[] | null {
  const buren = burenVan(ids, lijnen);
  if (!buren.has(van) || !buren.has(naar)) return null;
  if (van === naar) return [van];
  const afstand = new Map<string, number>([[van, 0]]);
  const vorige = new Map<string, string>();
  const open = new Set<string>([van]);
  const klaar = new Set<string>();
  while (open.size > 0) {
    let huidig: string | null = null;
    let best = Number.POSITIVE_INFINITY;
    for (const id of open) {
      const d = afstand.get(id) ?? Number.POSITIVE_INFINITY;
      if (d < best || (d === best && huidig !== null && id < huidig)) {
        best = d;
        huidig = id;
      }
    }
    if (huidig === null) break;
    open.delete(huidig);
    klaar.add(huidig);
    if (huidig === naar) break;
    for (const b of buren.get(huidig) ?? []) {
      if (klaar.has(b.id)) continue;
      const nd = best + 1 / Math.max(b.w, 0.01);
      if (nd < (afstand.get(b.id) ?? Number.POSITIVE_INFINITY)) {
        afstand.set(b.id, nd);
        vorige.set(b.id, huidig);
        open.add(b.id);
      }
    }
  }
  if (!afstand.has(naar)) return null;
  const pad = [naar];
  let c = naar;
  while (c !== van) {
    const v = vorige.get(c);
    if (!v) return null;
    pad.push(v);
    c = v;
  }
  return pad.reverse();
}

/** De buurt van een knoop: alles binnen `diepte` stappen, de knoop zelf eerst, dan op afstand en alfabet. */
export function buurt(ids: string[], lijnen: Lijn[], id: string, diepte = 1): string[] {
  const buren = burenVan(ids, lijnen);
  if (!buren.has(id)) return [];
  const afstand = new Map<string, number>([[id, 0]]);
  const rij = [id];
  let kop = 0;
  while (kop < rij.length) {
    const v = rij[kop++]!;
    const dv = afstand.get(v) ?? 0;
    if (dv >= diepte) continue;
    for (const b of [...(buren.get(v) ?? [])].sort((x, y) => x.id.localeCompare(y.id))) {
      if (!afstand.has(b.id)) {
        afstand.set(b.id, dv + 1);
        rij.push(b.id);
      }
    }
  }
  return [...afstand].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).map(([k]) => k);
}

export interface GraafCijfers {
  knopen: number;
  lijnen: number;
  /** aandeel van alle mogelijke lijnen dat er is (0–1) */
  dichtheid: number;
  gemiddeldeGraad: number;
  maxGraad: number;
  /** samenhangende delen en de grootte van het grootste */
  delen: number;
  grootsteDeel: number;
  /** de langste kortste weg (in stappen) binnen het grootste deel */
  diameter: number;
  /** knopen zonder enige lijn */
  los: number;
}

/** Netwerkcijfers in gewone taal: hoe dicht, hoe verbonden en hoe ver uit elkaar. */
export function graafCijfers(ids: string[], lijnen: Lijn[]): GraafCijfers {
  const n = ids.length;
  const buren = burenVan(ids, lijnen);
  const graden = ids.map((id) => (buren.get(id) ?? []).length);
  const m = graden.reduce((a, b) => a + b, 0) / 2;
  const delen = verbondenDelen(ids, lijnen);
  const grootste = delen[0] ?? [];
  // diameter van het grootste deel: BFS vanuit elke knoop (klein genoeg voor honderden documenten)
  let diameter = 0;
  const inDeel = new Set(grootste);
  for (const s of grootste) {
    const afstand = new Map<string, number>([[s, 0]]);
    const rij = [s];
    let kop = 0;
    while (kop < rij.length) {
      const v = rij[kop++]!;
      const dv = afstand.get(v) ?? 0;
      for (const b of buren.get(v) ?? []) {
        if (!inDeel.has(b.id) || afstand.has(b.id)) continue;
        afstand.set(b.id, dv + 1);
        rij.push(b.id);
        if (dv + 1 > diameter) diameter = dv + 1;
      }
    }
  }
  return {
    knopen: n,
    lijnen: Math.round(m),
    dichtheid: n > 1 ? Math.round(((2 * m) / (n * (n - 1))) * 1000) / 1000 : 0,
    gemiddeldeGraad: n > 0 ? Math.round(((2 * m) / n) * 10) / 10 : 0,
    maxGraad: graden.length > 0 ? Math.max(...graden) : 0,
    delen: delen.length,
    grootsteDeel: grootste.length,
    diameter,
    los: graden.filter((g) => g === 0).length,
  };
}

/** De naam van een thema: de begrippen die er het zwaarst wegen en er het meest eigen aan zijn. */
export function themaNaam(leden: readonly string[], begrippen: Begrip[], max = 3): string[] {
  const set = new Set(leden);
  return begrippen
    .map((b) => {
      const eigen = b.docs.filter((d) => set.has(d.docId));
      const aandeel = b.docs.length > 0 ? eigen.length / b.docs.length : 0;
      return { label: b.label, s: eigen.reduce((a, d) => a + d.gewicht, 0) * aandeel };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.label.localeCompare(b.label))
    .slice(0, max)
    .map((x) => x.label);
}

export interface Brugsuggestie {
  begrip: string;
  /** de thema's (1-based) die dit begrip delen zonder dat een lijn ze verbindt */
  themas: number[];
  docs: string[];
}

/**
 * Begrippen die in meerdere thema's zwaar wegen terwijl geen enkele lijn die thema's rechtstreeks verbindt: daar
 * ontbreekt een verwijzing of een gids die ze aan elkaar knoopt. Zwaarste begrippen eerst.
 */
export function brugsuggesties(groepen: string[][], begrippen: Begrip[], lijnen: { source: string; target: string }[], max = 8): Brugsuggestie[] {
  const themaVan = new Map<string, number>();
  groepen.forEach((g, i) => g.forEach((id) => themaVan.set(id, i + 1)));
  const verbonden = new Set(lijnen.map((l) => lijnSleutel(l.source, l.target)));
  const uit: Brugsuggestie[] = [];
  for (const b of begrippen) {
    const docs = b.docs.map((d) => d.docId).filter((id) => themaVan.has(id));
    const themas = [...new Set(docs.map((id) => themaVan.get(id) ?? 0))].sort((x, y) => x - y);
    if (themas.length < 2) continue;
    let brug = false;
    for (let i = 0; i < docs.length && !brug; i++) {
      for (let j = i + 1; j < docs.length; j++) {
        const a = docs[i]!;
        const c = docs[j]!;
        if (themaVan.get(a) !== themaVan.get(c) && verbonden.has(lijnSleutel(a, c))) {
          brug = true;
          break;
        }
      }
    }
    if (brug) continue;
    uit.push({ begrip: b.label, themas, docs: docs.slice(0, 6) });
    if (uit.length >= max) break;
  }
  return uit;
}

export interface Hiaten {
  /** documenten zonder enige lijn */
  los: string[];
  /** begrippen die maar in twee documenten voorkomen: dun gedekt */
  dunneBegrippen: string[];
  /** samenhangende delen van hooguit twee documenten */
  eilandjes: string[][];
}

export function hiaten(knopen: GraafKnoop[], lijnen: GraafLijn[], begrippen: Begrip[]): Hiaten {
  const docIds = knopen.filter((k) => k.group !== "begrip").map((k) => k.id);
  const verbonden = new Set(lijnen.filter((l) => l.soort !== "begrip").flatMap((l) => [l.source, l.target]));
  const delen = verbondenDelen(docIds, lijnen.filter((l) => l.soort !== "begrip"));
  return {
    los: docIds.filter((id) => !verbonden.has(id)),
    dunneBegrippen: begrippen.filter((b) => b.docs.length <= 2).map((b) => b.label),
    eilandjes: delen.filter((d) => d.length === 2),
  };
}

/** PageRank op een ongerichte, gewogen graaf; som van de scores is 1. */
export function pagerank(ids: string[], lijnen: { source: string; target: string; weight: number }[], rondes = 40, demping = 0.85): Map<string, number> {
  const n = ids.length;
  const score = new Map<string, number>();
  if (n === 0) return score;
  const buren = new Map<string, { id: string; w: number }[]>(ids.map((id) => [id, []]));
  const somGewicht = new Map<string, number>(ids.map((id) => [id, 0]));
  for (const l of lijnen) {
    if (!buren.has(l.source) || !buren.has(l.target) || l.weight <= 0) continue;
    buren.get(l.source)!.push({ id: l.target, w: l.weight });
    buren.get(l.target)!.push({ id: l.source, w: l.weight });
    somGewicht.set(l.source, (somGewicht.get(l.source) ?? 0) + l.weight);
    somGewicht.set(l.target, (somGewicht.get(l.target) ?? 0) + l.weight);
  }
  for (const id of ids) score.set(id, 1 / n);
  for (let r = 0; r < rondes; r++) {
    const volgende = new Map<string, number>();
    let verdwaald = 0; // knopen zonder lijnen verdelen hun score over iedereen
    for (const id of ids) if ((somGewicht.get(id) ?? 0) === 0) verdwaald += score.get(id) ?? 0;
    for (const id of ids) volgende.set(id, (1 - demping) / n + (demping * verdwaald) / n);
    for (const id of ids) {
      const s = score.get(id) ?? 0;
      const tot = somGewicht.get(id) ?? 0;
      if (tot === 0) continue;
      for (const b of buren.get(id) ?? []) volgende.set(b.id, (volgende.get(b.id) ?? 0) + demping * s * (b.w / tot));
    }
    for (const [id, v] of volgende) score.set(id, v);
  }
  return score;
}

// --- momentopnamen ----------------------------------------------------------

/** Eén sleutel per lijn, onafhankelijk van de richting. */
export const lijnSleutel = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

export interface Snapshot {
  op: string;
  knopen: string[];
  /** lijnsleutels van de documentverbanden (zonder de begriplijnen) */
  lijnen: string[];
  cijfers: { documenten: number; begrippen: number; lijnen: number; semantisch: number; themas: number; los: number };
}

export interface SnapshotVerschil {
  nieuweKnopen: string[];
  wegKnopen: string[];
  nieuweLijnen: string[];
  wegLijnen: string[];
}

/** Wat er bijkwam en wegviel tussen twee momentopnamen. */
export function snapshotVerschil(oud: Pick<Snapshot, "knopen" | "lijnen">, nieuw: Pick<Snapshot, "knopen" | "lijnen">): SnapshotVerschil {
  const oudK = new Set(oud.knopen);
  const nieuwK = new Set(nieuw.knopen);
  const oudL = new Set(oud.lijnen);
  const nieuwL = new Set(nieuw.lijnen);
  return {
    nieuweKnopen: nieuw.knopen.filter((k) => !oudK.has(k)).sort(),
    wegKnopen: oud.knopen.filter((k) => !nieuwK.has(k)).sort(),
    nieuweLijnen: nieuw.lijnen.filter((l) => !oudL.has(l)).sort(),
    wegLijnen: oud.lijnen.filter((l) => !nieuwL.has(l)).sort(),
  };
}

// --- exports ----------------------------------------------------------------

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** GraphML, te openen in Gephi, yEd of Obsidian-achtige tools. */
export function naarGraphML(knopen: GraafKnoop[], lijnen: GraafLijn[]): string {
  const regels = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<graphml xmlns="http://graphml.graphdrawing.org/xmlns">',
    '  <key id="label" for="node" attr.name="label" attr.type="string"/>',
    '  <key id="group" for="node" attr.name="group" attr.type="string"/>',
    '  <key id="size" for="node" attr.name="size" attr.type="int"/>',
    '  <key id="thema" for="node" attr.name="thema" attr.type="int"/>',
    '  <key id="weight" for="edge" attr.name="weight" attr.type="double"/>',
    '  <key id="soort" for="edge" attr.name="soort" attr.type="string"/>',
    '  <graph id="zekerflex-kennisgraaf" edgedefault="undirected">',
  ];
  for (const k of knopen) {
    regels.push(
      `    <node id="${xml(k.id)}"><data key="label">${xml(k.label)}</data><data key="group">${xml(k.group)}</data><data key="size">${k.size}</data><data key="thema">${k.thema ?? 0}</data></node>`,
    );
  }
  lijnen.forEach((l, i) => {
    regels.push(`    <edge id="e${i}" source="${xml(l.source)}" target="${xml(l.target)}"><data key="weight">${l.weight}</data><data key="soort">${l.soort}</data></edge>`);
  });
  regels.push("  </graph>", "</graphml>", "");
  return regels.join("\n");
}

const dot = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/** DOT (Graphviz): `fdp -Tsvg kennisgraaf.dot > kennisgraaf.svg`. Begrippen als ruit, documenten als stip, thema als groep. */
export function naarDOT(knopen: GraafKnoop[], lijnen: GraafLijn[]): string {
  const regels = [
    "graph kennisgraaf {",
    "  layout=fdp; overlap=false; splines=true; bgcolor=white;",
    '  node [shape=circle style=filled fontname="Helvetica" fontsize=9 color="#334155" fillcolor="#cbd5e1"];',
    '  edge [color="#94a3b8"];',
  ];
  for (const k of knopen) {
    const vorm = k.group === "begrip" ? " shape=diamond fillcolor=\"#fde68a\"" : "";
    regels.push(`  ${dot(k.id)} [label=${dot(k.label)} group=${dot(k.group)} thema=${k.thema ?? 0} width=${(0.25 + Math.sqrt(k.size) * 0.1).toFixed(2)}${vorm}];`);
  }
  for (const l of lijnen) {
    const stijl = l.soort === "begrip" ? " style=dashed" : l.soort === "semantisch" ? ' color="#a78bfa"' : "";
    regels.push(`  ${dot(l.source)} -- ${dot(l.target)} [weight=${l.weight} penwidth=${(0.5 + l.weight * 3).toFixed(2)}${stijl}];`);
  }
  regels.push("}", "");
  return regels.join("\n");
}

/** Een cel die Excel niet als formule uitvoert; puntkomma als scheidingsteken (Nederlandse Excel). */
function csvCel(v: string | number | null | undefined): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Twee CSV-bestanden (knopen en lijnen), met een BOM zodat Excel de accenten goed leest. */
export function naarCSV(knopen: GraafKnoop[], lijnen: GraafLijn[]): { knopen: string; lijnen: string } {
  const bom = "﻿";
  const k = [["id", "naam", "soort", "grootte", "thema", "link"].join(";"), ...knopen.map((n) => [n.id, n.label, n.group, n.size, n.thema ?? "", n.href ?? ""].map(csvCel).join(";"))];
  const l = [["van", "naar", "gewicht", "soort"].join(";"), ...lijnen.map((e) => [e.source, e.target, e.weight, e.soort].map(csvCel).join(";"))];
  return { knopen: `${bom}${k.join("\r\n")}\r\n`, lijnen: `${bom}${l.join("\r\n")}\r\n` };
}

export interface RapportInvoer {
  op: string;
  cijfers: GraafCijfers;
  begrippen: number;
  semantisch: number;
  modulariteit: number;
  themas: { id: number; naam: string; grootte: number; kern: string[] }[];
  centraal: { label: string; score: number }[];
  bruggen: { label: string; score: number }[];
  hiaten: { los: string[]; eilandjes: string[][]; dunneBegrippen: string[] };
  brugsuggesties: { begrip: string; themas: number[] }[];
  groei: { dag: string; documenten: number; lijnen: number }[];
}

const datumNl = (iso: string) => new Date(iso).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Het rapport voor de eigenaar, in gewone taal (Markdown). */
export function rapportMarkdown(r: RapportInvoer): string {
  const c = r.cijfers;
  const regels: string[] = [
    "# Kennisgraaf van ZekerFlex",
    "",
    `Berekend op ${datumNl(r.op)}.`,
    "",
    "## In één oogopslag",
    "",
    `- ${c.knopen} kennisdocumenten met ${c.lijnen} verbanden (${r.semantisch > 0 ? `${r.semantisch} documenten met een semantische vector` : "nog zonder semantische laag"}).`,
    `- ${r.begrippen} begrippen dragen het corpus; ${r.themas.length} thema's, modulariteit ${r.modulariteit.toFixed(2)} (${r.modulariteit >= 0.3 ? "een duidelijke structuur" : r.modulariteit >= 0.15 ? "een lichte structuur" : "weinig structuur"}).`,
    `- Dichtheid ${(c.dichtheid * 100).toFixed(1)}%, gemiddeld ${c.gemiddeldeGraad} verbanden per document, grootste samenhangende deel ${c.grootsteDeel} documenten, diameter ${c.diameter} stappen.`,
    `- ${c.los === 0 ? "Geen document staat los." : `${c.los} ${c.los === 1 ? "document staat" : "documenten staan"} los.`}`,
    "",
    "## Thema's",
    "",
  ];
  for (const t of r.themas) regels.push(`${t.id}. **${t.naam}** — ${t.grootte} ${t.grootte === 1 ? "document" : "documenten"}; kern: ${t.kern.join(", ") || "–"}`);
  regels.push("", "## Meest centrale documenten (PageRank × 1000)", "");
  for (const x of r.centraal) regels.push(`- ${x.label}: ${x.score}`);
  regels.push("", "## Bruggen (tussenligging)", "", "Documenten die thema's aan elkaar knopen; valt zo'n document weg, dan raken delen van de kennis elkaar niet meer.", "");
  for (const x of r.bruggen) regels.push(`- ${x.label}: ${x.score}`);
  regels.push("", "## Hiaten", "");
  if (r.hiaten.los.length > 0) regels.push(`- Los: ${r.hiaten.los.join(", ")}.`);
  if (r.hiaten.eilandjes.length > 0) regels.push(`- Eilandjes van twee: ${r.hiaten.eilandjes.map((e) => e.join(" + ")).join("; ")}.`);
  if (r.hiaten.dunneBegrippen.length > 0) regels.push(`- Dun gedekte begrippen: ${r.hiaten.dunneBegrippen.join(", ")}.`);
  if (r.hiaten.los.length === 0 && r.hiaten.eilandjes.length === 0 && r.hiaten.dunneBegrippen.length === 0) regels.push("- Geen hiaten gevonden.");
  regels.push("", "## Ontbrekende schakels", "");
  if (r.brugsuggesties.length === 0) regels.push("- Elk gedeeld begrip is al met een verwijzing verbonden.");
  for (const s of r.brugsuggesties) regels.push(`- Het begrip "${s.begrip}" speelt in thema ${s.themas.join(" en ")}, maar geen lijn verbindt die thema's: een gids of verwijzing hierover knoopt ze aan elkaar.`);
  regels.push("", "## Groei", "");
  if (r.groei.length < 2) regels.push("- Nog geen reeks: de eerste momentopnamen worden 's nachts gemaakt.");
  else {
    const eerste = r.groei[0]!;
    const laatste = r.groei[r.groei.length - 1]!;
    regels.push(`- Van ${eerste.dag} (${eerste.documenten} documenten, ${eerste.lijnen} verbanden) naar ${laatste.dag} (${laatste.documenten} documenten, ${laatste.lijnen} verbanden), ${r.groei.length} momentopnamen.`);
  }
  regels.push("");
  return regels.join("\n");
}
