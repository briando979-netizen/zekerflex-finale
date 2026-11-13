import { stem } from "@/lib/rag/lexical";
import { hashVan, toeval } from "@/lib/rag/graph-layout3d";

// ---------------------------------------------------------------------------
// Het slimme deel van het Brein, puur en deterministisch (geen database):
//   synapsen       — voor elk geheugenstuk zijn sterkste betekenisverwanten (cosinus
//                    tussen de echte embeddings), over alle bronnen heen;
//   ontdekken      — k-means over de embeddings: het brein verdeelt zijn geheugen
//                    zelf in thema's op betekenis, los van bron of document;
//   benoemen       — elk ontdekt thema krijgt een naam uit de woorden die er het
//                    meest eigen aan zijn (TF-IDF over de clusters).
// Alles rekent op genormaliseerde vectoren; dezelfde invoer geeft dezelfde uitkomst.
// ---------------------------------------------------------------------------

export interface Vector {
  id: string;
  v: number[];
}

/** Lengte 1, zodat het inproduct de cosinus is. */
export function normaliseer(v: readonly number[]): number[] {
  let som = 0;
  for (const x of v) som += x * x;
  const l = Math.sqrt(som) || 1;
  return v.map((x) => x / l);
}

export function inproduct(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += (a[i] ?? 0) * (b[i] ?? 0);
  return s;
}

export type Synaps = [string, string, number];

/**
 * Per stuk de `k` sterkste verwanten met cosinus ≥ `min`, als ongerichte paren (id-a < id-b), sterkste eerst.
 * O(n²·d): enkele seconden voor een paar duizend stukken, één keer per nacht of op verzoek.
 */
export function synapsen(vectoren: readonly Vector[], k = 4, min = 0.5): Synaps[] {
  const n = vectoren.length;
  const norm = vectoren.map((x) => normaliseer(x.v));
  const beste: { j: number; s: number }[][] = Array.from({ length: n }, () => []);
  const neem = (lijst: { j: number; s: number }[], j: number, s: number) => {
    if (s < min) return;
    if (lijst.length < k) {
      lijst.push({ j, s });
      lijst.sort((a, b) => b.s - a.s);
      return;
    }
    const laatste = lijst[lijst.length - 1];
    if (laatste && s > laatste.s) {
      lijst[lijst.length - 1] = { j, s };
      lijst.sort((a, b) => b.s - a.s);
    }
  };
  for (let i = 0; i < n; i++) {
    const a = norm[i]!;
    for (let j = i + 1; j < n; j++) {
      const s = inproduct(a, norm[j]!);
      neem(beste[i]!, j, s);
      neem(beste[j]!, i, s);
    }
  }
  const gezien = new Set<string>();
  const uit: Synaps[] = [];
  beste.forEach((lijst, i) => {
    for (const { j, s } of lijst) {
      const a = vectoren[i]!.id;
      const b = vectoren[j]!.id;
      const sleutel = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (gezien.has(sleutel)) continue;
      gezien.add(sleutel);
      uit.push(a < b ? [a, b, Math.round(s * 1000) / 1000] : [b, a, Math.round(s * 1000) / 1000]);
    }
  });
  return uit.sort((x, y) => y[2] - x[2] || x[0].localeCompare(y[0]) || x[1].localeCompare(y[1]));
}

/** Hoeveel thema's het brein zoekt: groeit met de wortel van het aantal stukken, tussen 6 en 16. */
export function kiesK(n: number): number {
  if (n <= 0) return 0;
  if (n < 12) return Math.max(1, Math.floor(n / 2));
  return Math.min(16, Math.max(6, Math.round(Math.sqrt(n / 20))));
}

export interface Ontdekking {
  /** per stuk-id het nummer van zijn ontdekte thema (0-based) */
  per: Record<string, number>;
  groottes: number[];
  k: number;
  rondes: number;
}

/**
 * k-means op genormaliseerde embeddings (cosinus), deterministisch: de startpunten komen uit k-means++ met een vaste
 * toevalsgenerator (zaad uit de id's), hooguit `rondes` rondes of tot niets meer verschuift. Lege thema's vallen weg.
 */
export function ontdekThemas(vectoren: readonly Vector[], k = kiesK(vectoren.length), rondes = 25): Ontdekking {
  const n = vectoren.length;
  if (n === 0 || k <= 0) return { per: {}, groottes: [], k: 0, rondes: 0 };
  const kk = Math.min(k, n);
  const norm = vectoren.map((x) => normaliseer(x.v));
  const d = norm[0]?.length ?? 0;
  const r = toeval(hashVan(vectoren.map((x) => x.id).join("|")));
  // k-means++: het eerste middelpunt willekeurig, elk volgende met kans evenredig aan de afstand tot het dichtste
  const centra: number[][] = [norm[Math.floor(r() * n)]!.slice()];
  const dichtst = new Float64Array(n).fill(2);
  while (centra.length < kk) {
    const c = centra[centra.length - 1]!;
    let som = 0;
    for (let i = 0; i < n; i++) {
      const afst = Math.max(0, 1 - inproduct(norm[i]!, c));
      if (afst < dichtst[i]!) dichtst[i] = afst;
      som += dichtst[i]!;
    }
    let drempel = r() * som;
    let keus = n - 1;
    for (let i = 0; i < n; i++) {
      drempel -= dichtst[i]!;
      if (drempel <= 0) {
        keus = i;
        break;
      }
    }
    centra.push(norm[keus]!.slice());
  }
  const toewijzing = new Int32Array(n).fill(-1);
  let gedraaid = 0;
  for (let ronde = 0; ronde < rondes; ronde++) {
    gedraaid = ronde + 1;
    let verschoven = 0;
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bestS = -2;
      for (let c = 0; c < centra.length; c++) {
        const s = inproduct(norm[i]!, centra[c]!);
        if (s > bestS) {
          bestS = s;
          best = c;
        }
      }
      if (toewijzing[i] !== best) {
        toewijzing[i] = best;
        verschoven++;
      }
    }
    // nieuwe middelpunten: het genormaliseerde gemiddelde
    const som = centra.map(() => new Float64Array(d));
    const tel = new Int32Array(centra.length);
    for (let i = 0; i < n; i++) {
      const c = toewijzing[i]!;
      tel[c] = (tel[c] ?? 0) + 1;
      const v = norm[i]!;
      const s = som[c]!;
      for (let x = 0; x < d; x++) s[x] = (s[x] ?? 0) + (v[x] ?? 0);
    }
    for (let c = 0; c < centra.length; c++) {
      if ((tel[c] ?? 0) === 0) continue;
      centra[c] = normaliseer(Array.from(som[c]!));
    }
    if (verschoven === 0) break;
  }
  // lege thema's weg en opnieuw nummeren, grootste eerst
  const tel = new Map<number, number>();
  for (let i = 0; i < n; i++) tel.set(toewijzing[i]!, (tel.get(toewijzing[i]!) ?? 0) + 1);
  const volgorde = [...tel].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([c]) => c);
  const nieuwNummer = new Map(volgorde.map((c, i) => [c, i]));
  const per: Record<string, number> = {};
  for (let i = 0; i < n; i++) per[vectoren[i]!.id] = nieuwNummer.get(toewijzing[i]!) ?? 0;
  return { per, groottes: volgorde.map((c) => tel.get(c) ?? 0), k: volgorde.length, rondes: gedraaid };
}

const STOP = new Set(
  (
    "de het een en van is in op voor je jij ik dat dit hoe wat wanneer waar waarom wie kan kun kunnen met als niet ook of aan zijn er bij naar dan zo " +
    "maar deze die worden word wordt om te tot heb hebt heeft nog wel geen mijn jouw uw hun me mij we wij ze zij hij u moet moeten mag mogen wil " +
    "dus daar hier over onder door uit meer minder alle alles altijd nooit zonder omdat zodat want toch echter bijvoorbeeld daarna daarvoor zoals " +
    "binnen buiten tegen tussen vanaf sinds steeds iedere elke ander andere eigen zelf veel weinig ongeveer vaak soms eerst later direct " +
    "the and for with you your are this that from into has have will not can per via true false null undefined const function return export import " +
    "string number status datum date type naam name"
  ).split(" "),
);

/**
 * Namen voor ontdekte thema's: per thema de woorden die er het zwaarst wegen en het minst in de andere thema's
 * voorkomen (TF-IDF over de thema's), in hun meest voorkomende schrijfwijze. `teksten[i]` = alle tekst van thema i.
 */
export function benoemThemas(teksten: readonly string[], max = 3): string[][] {
  const k = teksten.length;
  const tfs: Map<string, number>[] = [];
  const df = new Map<string, number>();
  const vormen = new Map<string, Map<string, number>>();
  for (const t of teksten) {
    const tf = new Map<string, number>();
    const ruw = t.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").match(/\p{L}{4,}/gu) ?? [];
    for (const w of ruw) {
      if (STOP.has(w)) continue;
      const s = stem(w);
      if (s.length < 4) continue;
      tf.set(s, (tf.get(s) ?? 0) + 1);
      const m = vormen.get(s) ?? new Map<string, number>();
      m.set(w, (m.get(w) ?? 0) + 1);
      vormen.set(s, m);
    }
    for (const s of tf.keys()) df.set(s, (df.get(s) ?? 0) + 1);
    tfs.push(tf);
  }
  const label = (s: string) => [...(vormen.get(s) ?? new Map<string, number>())].sort((a, b) => b[1] - a[1])[0]?.[0] ?? s;
  return tfs.map((tf) => {
    const lengte = [...tf.values()].reduce((a, b) => a + b, 0) || 1;
    return [...tf]
      .map(([s, c]) => ({ s, w: (c / lengte) * Math.log(1 + k / (df.get(s) ?? 1)) * (df.get(s) === k && k > 1 ? 0.35 : 1) }))
      .sort((a, b) => b.w - a.w || a.s.localeCompare(b.s))
      .slice(0, max)
      .map((x) => label(x.s));
  });
}
