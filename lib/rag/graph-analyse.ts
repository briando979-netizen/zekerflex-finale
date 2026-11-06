import { stem } from "@/lib/rag/lexical";

// ---------------------------------------------------------------------------
// Rekenwerk van de Kennisgraaf, zonder database of corpus: begrippen uit tekst
// (TF-IDF), samenhangende delen (clusters), PageRank (welk document is het
// meest centraal), hiaten en een GraphML-export. Puur, dus testbaar en ook in
// client-code bruikbaar; de graaf zelf staat in lib/rag/graph.ts.
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

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** GraphML, te openen in Gephi, yEd of Obsidian-achtige tools. */
export function naarGraphML(knopen: GraafKnoop[], lijnen: GraafLijn[]): string {
  const regels = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<graphml xmlns="http://graphml.graphdrawing.org/xmlns">',
    '  <key id="label" for="node" attr.name="label" attr.type="string"/>',
    '  <key id="group" for="node" attr.name="group" attr.type="string"/>',
    '  <key id="size" for="node" attr.name="size" attr.type="int"/>',
    '  <key id="weight" for="edge" attr.name="weight" attr.type="double"/>',
    '  <key id="soort" for="edge" attr.name="soort" attr.type="string"/>',
    '  <graph id="zekerflex-kennisgraaf" edgedefault="undirected">',
  ];
  for (const k of knopen) {
    regels.push(`    <node id="${xml(k.id)}"><data key="label">${xml(k.label)}</data><data key="group">${xml(k.group)}</data><data key="size">${k.size}</data></node>`);
  }
  lijnen.forEach((l, i) => {
    regels.push(`    <edge id="e${i}" source="${xml(l.source)}" target="${xml(l.target)}"><data key="weight">${l.weight}</data><data key="soort">${l.soort}</data></edge>`);
  });
  regels.push("  </graph>", "</graphml>", "");
  return regels.join("\n");
}
