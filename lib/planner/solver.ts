// ---------------------------------------------------------------------------
// Roosterplanner: welke kracht op welke dienst, zodat alle plekken gevuld zijn
// tegen de laagste kosten (loon + reis), met harde randvoorwaarden:
//   - certificaten (VCA, BHV, …) en vak die de dienst vereist;
//   - niet twee diensten tegelijk en minstens `rustUren` tussen twee diensten;
//   - niet boven `maxWeekUren` in de week (Arbeidstijdenwet-plafond);
//   - niet verder dan `maxReisKm`, en de eigen grenzen van de kracht
//     (maximale reistijd, minimumtarief).
// Puur bestand: zonder prisma/kv, dus overal te draaien en volledig te testen.
// De rekenwijze is deterministisch: dezelfde invoer geeft hetzelfde rooster.
//
// Dezelfde invoer kan ook naar de losse OR-Tools-dienst (deploy/planner); die
// krijgt de hier berekende kandidaten (haalbaar + kosten) en lost alleen de
// toewijzing exact op. Zie service.ts.
// ---------------------------------------------------------------------------

export interface PlanDienst {
  id: string;
  titel: string;
  locatie: string;
  /** ms sinds epoch */
  start: number;
  einde: number;
  pauzeMinuten: number;
  /** nog te vullen plekken */
  plekken: number;
  uurtariefCents: number;
  lat: number;
  lng: number;
  /** vereiste certificaattypes (lib/certificates), bijv. VCA_BASIS */
  certificaten: string[];
  skillId: string | null;
}

export interface PlanKracht {
  id: string;
  naam: string;
  lat: number;
  lng: number;
  certificaten: string[];
  skillIds: string[];
  /** 0..1 */
  betrouwbaarheid: number;
  /** al ingeplande diensten rond de week (voor overlap en rust) */
  bezet: { start: number; einde: number }[];
  /** al ingeplande minuten in de planweek */
  weekMinuten: number;
  maxReisMinuten?: number;
  minUurtariefCents?: number;
  /** favoriet van dit bedrijf: krijgt de voorkeur bij gelijke kosten */
  favoriet?: boolean;
}

export interface PlanInstellingen {
  maxReisKm: number;
  maxWeekUren: number;
  rustUren: number;
  /** waar de planner op stuurt bij de keuze tussen krachten */
  voorkeur: "kosten" | "balans" | "betrouwbaarheid";
  /** reiskostenvergoeding per km, heen en terug (standaard € 0,23) */
  reiskostenPerKmCents: number;
}

export const STANDAARD_INSTELLINGEN: PlanInstellingen = { maxReisKm: 40, maxWeekUren: 60, rustUren: 11, voorkeur: "balans", reiskostenPerKmCents: 23 };

export interface Kandidaat {
  dienstId: string;
  krachtId: string;
  reisKm: number;
  reisMinuten: number;
  loonCents: number;
  reisCents: number;
  /** lager is beter; waar de keuze op valt */
  score: number;
  redenen: string[];
}

export interface Toewijzing extends Kandidaat {
  naam: string;
}

export interface Onvervuld {
  dienstId: string;
  open: number;
  reden: string;
}

export interface PlanResultaat {
  toewijzingen: Toewijzing[];
  onvervuld: Onvervuld[];
  totaal: { loonCents: number; reisKm: number; reisCents: number; plekken: number; gevuld: number; bezettingPct: number };
  oplosser: "intern" | "ortools";
  ms: number;
}

const MINUUT = 60_000;
const UUR = 60 * MINUUT;
/** rechte lijn → echte route (zelfde factor als de reistijd-schatting bij matching) */
const OMRIJFACTOR = 1.35;
const SNELHEID_KMU = 42;

export function afstandKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h)) * OMRIJFACTOR;
}

export const werkMinuten = (d: Pick<PlanDienst, "start" | "einde" | "pauzeMinuten">): number => Math.max(0, Math.round((d.einde - d.start) / MINUUT) - d.pauzeMinuten);

function overlaptOfTeDichtbij(a: { start: number; einde: number }, b: { start: number; einde: number }, rustMs: number): boolean {
  return a.start < b.einde + rustMs && b.start < a.einde + rustMs;
}

/** Waarom een kracht een dienst niet kan doen; leeg = haalbaar. */
export function belemmeringen(d: PlanDienst, k: PlanKracht, i: PlanInstellingen, extraBezet: { start: number; einde: number }[] = [], extraWeekMinuten = 0): string[] {
  const uit: string[] = [];
  const mist = d.certificaten.filter((c) => !k.certificaten.includes(c));
  if (mist.length) uit.push(`mist certificaat ${mist.join(", ")}`);
  if (d.skillId && !k.skillIds.includes(d.skillId)) uit.push("heeft het vak niet");
  const km = afstandKm(d, k);
  if (km > i.maxReisKm) uit.push(`te ver (${Math.round(km)} km)`);
  const reisMinuten = Math.round((km / SNELHEID_KMU) * 60);
  if (k.maxReisMinuten && reisMinuten > k.maxReisMinuten) uit.push(`buiten eigen reistijd (${reisMinuten} min)`);
  if (k.minUurtariefCents && d.uurtariefCents < k.minUurtariefCents) uit.push("tarief onder eigen minimum");
  const rustMs = i.rustUren * UUR;
  if ([...k.bezet, ...extraBezet].some((b) => overlaptOfTeDichtbij(d, b, rustMs))) uit.push("al ingepland (of te weinig rust ertussen)");
  if (k.weekMinuten + extraWeekMinuten + werkMinuten(d) > i.maxWeekUren * 60) uit.push(`boven ${i.maxWeekUren} uur deze week`);
  return uit;
}

/** De kosten en score van één mogelijke toewijzing (zonder haalbaarheid). */
export function kandidaat(d: PlanDienst, k: PlanKracht, i: PlanInstellingen): Kandidaat {
  const km = afstandKm(d, k);
  const reisMinuten = Math.round((km / SNELHEID_KMU) * 60);
  const loonCents = Math.round((werkMinuten(d) / 60) * d.uurtariefCents);
  const reisCents = Math.round(km * 2 * i.reiskostenPerKmCents);
  const kosten = loonCents + reisCents;
  // alles in "euro-equivalenten": betrouwbaarheid weegt als een opslag op de kosten
  const onbetrouwbaar = 1 - Math.min(1, Math.max(0, k.betrouwbaarheid));
  const gewicht = i.voorkeur === "kosten" ? 0.05 : i.voorkeur === "betrouwbaarheid" ? 0.8 : 0.4;
  let score = kosten * (1 + gewicht * onbetrouwbaar) + reisMinuten * 10;
  if (k.favoriet) score *= 0.97;
  return { dienstId: d.id, krachtId: k.id, reisKm: Math.round(km * 10) / 10, reisMinuten, loonCents, reisCents, score: Math.round(score), redenen: [] };
}

interface Stand {
  bezet: Map<string, { start: number; einde: number }[]>;
  weekMinuten: Map<string, number>;
  open: Map<string, number>;
}

function kiesReden(d: PlanDienst, krachten: PlanKracht[], i: PlanInstellingen, stand: Stand): string {
  if (krachten.length === 0) return "geen beschikbare krachten";
  const telling = new Map<string, number>();
  for (const k of krachten) {
    for (const r of belemmeringen(d, k, i, stand.bezet.get(k.id) ?? [], stand.weekMinuten.get(k.id) ?? 0)) {
      const sleutel = r.replace(/\(.*?\)/, "").trim();
      telling.set(sleutel, (telling.get(sleutel) ?? 0) + 1);
    }
  }
  const top = [...telling.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return top ? `${top[1]} van ${krachten.length} krachten: ${top[0]}` : "geen kracht past";
}

/**
 * Het rooster: eerst de goedkoopste haalbare combinatie per plek (gretig, over
 * alle diensten heen), daarna ruilen tussen twee toewijzingen zolang dat de
 * totale score verlaagt en haalbaar blijft. Diensten met weinig kandidaten
 * komen eerst aan de beurt, zodat een schaarse kracht niet wordt opgemaakt
 * aan een dienst waar ook anderen voor kunnen.
 */
export function losOpIntern(diensten: PlanDienst[], krachten: PlanKracht[], instellingen: Partial<PlanInstellingen> = {}): PlanResultaat {
  const t0 = Date.now();
  const i: PlanInstellingen = { ...STANDAARD_INSTELLINGEN, ...instellingen };
  const stand: Stand = { bezet: new Map(), weekMinuten: new Map(), open: new Map(diensten.map((d) => [d.id, Math.max(0, d.plekken)])) };
  const dienstVan = new Map(diensten.map((d) => [d.id, d]));
  const krachtVan = new Map(krachten.map((k) => [k.id, k]));
  const toewijzingen: Toewijzing[] = [];

  const haalbaar = (d: PlanDienst, k: PlanKracht, zonder?: Toewijzing): boolean => {
    const bezet = (stand.bezet.get(k.id) ?? []).filter((b) => !(zonder && zonder.krachtId === k.id && b.start === dienstVan.get(zonder.dienstId)?.start));
    const minuten = (stand.weekMinuten.get(k.id) ?? 0) - (zonder && zonder.krachtId === k.id ? werkMinuten(dienstVan.get(zonder.dienstId)!) : 0);
    return belemmeringen(d, k, i, bezet, minuten).length === 0;
  };
  const neem = (d: PlanDienst, k: PlanKracht) => {
    stand.bezet.set(k.id, [...(stand.bezet.get(k.id) ?? []), { start: d.start, einde: d.einde }]);
    stand.weekMinuten.set(k.id, (stand.weekMinuten.get(k.id) ?? 0) + werkMinuten(d));
    stand.open.set(d.id, (stand.open.get(d.id) ?? 0) - 1);
  };
  const geef = (d: PlanDienst, k: PlanKracht) => {
    stand.bezet.set(k.id, (stand.bezet.get(k.id) ?? []).filter((b) => b.start !== d.start || b.einde !== d.einde));
    stand.weekMinuten.set(k.id, (stand.weekMinuten.get(k.id) ?? 0) - werkMinuten(d));
    stand.open.set(d.id, (stand.open.get(d.id) ?? 0) + 1);
  };

  // schaarste eerst: diensten met de minste haalbare krachten, dan op starttijd
  const kandidatenPer = new Map<string, Kandidaat[]>();
  for (const d of diensten) {
    const lijst = krachten
      .filter((k) => belemmeringen(d, k, i).length === 0)
      .map((k) => kandidaat(d, k, i))
      .sort((a, b) => a.score - b.score || a.krachtId.localeCompare(b.krachtId));
    kandidatenPer.set(d.id, lijst);
  }
  const volgorde = [...diensten].sort((a, b) => (kandidatenPer.get(a.id)?.length ?? 0) - (kandidatenPer.get(b.id)?.length ?? 0) || a.start - b.start || a.id.localeCompare(b.id));

  // gretig: per dienst de goedkoopste nog haalbare krachten
  for (const d of volgorde) {
    for (const c of kandidatenPer.get(d.id) ?? []) {
      if ((stand.open.get(d.id) ?? 0) <= 0) break;
      const k = krachtVan.get(c.krachtId)!;
      if (toewijzingen.some((t) => t.dienstId === d.id && t.krachtId === k.id)) continue;
      if (!haalbaar(d, k)) continue;
      neem(d, k);
      toewijzingen.push({ ...c, naam: k.naam });
    }
  }

  // verbeteren: ruil twee krachten van dienst als dat goedkoper is en kan
  let verbeterd = true;
  let rondes = 0;
  while (verbeterd && rondes < 20) {
    verbeterd = false;
    rondes += 1;
    for (let x = 0; x < toewijzingen.length; x++) {
      for (let y = x + 1; y < toewijzingen.length; y++) {
        const a = toewijzingen[x]!;
        const b = toewijzingen[y]!;
        if (a.dienstId === b.dienstId || a.krachtId === b.krachtId) continue;
        const da = dienstVan.get(a.dienstId)!;
        const db = dienstVan.get(b.dienstId)!;
        const ka = krachtVan.get(a.krachtId)!;
        const kb = krachtVan.get(b.krachtId)!;
        const nieuwA = kandidaat(da, kb, i);
        const nieuwB = kandidaat(db, ka, i);
        if (nieuwA.score + nieuwB.score >= a.score + b.score) continue;
        if (toewijzingen.some((t) => (t.dienstId === da.id && t.krachtId === kb.id) || (t.dienstId === db.id && t.krachtId === ka.id))) continue;
        // tijdelijk teruggeven, dan controleren of de ruil past
        geef(da, ka);
        geef(db, kb);
        if (haalbaar(da, kb) && haalbaar(db, ka)) {
          neem(da, kb);
          neem(db, ka);
          toewijzingen[x] = { ...nieuwA, naam: kb.naam };
          toewijzingen[y] = { ...nieuwB, naam: ka.naam };
          verbeterd = true;
        } else {
          neem(da, ka);
          neem(db, kb);
        }
      }
    }
  }

  // en nog één keer vullen: door ruilen kan ergens een plek vrij zijn gekomen
  for (const d of volgorde) {
    for (const c of kandidatenPer.get(d.id) ?? []) {
      if ((stand.open.get(d.id) ?? 0) <= 0) break;
      const k = krachtVan.get(c.krachtId)!;
      if (toewijzingen.some((t) => t.dienstId === d.id && t.krachtId === k.id)) continue;
      if (!haalbaar(d, k)) continue;
      neem(d, k);
      toewijzingen.push({ ...c, naam: k.naam });
    }
  }

  const onvervuld: Onvervuld[] = diensten
    .filter((d) => (stand.open.get(d.id) ?? 0) > 0)
    .map((d) => ({ dienstId: d.id, open: stand.open.get(d.id) ?? 0, reden: kiesReden(d, krachten, i, stand) }));

  toewijzingen.sort((a, b) => (dienstVan.get(a.dienstId)?.start ?? 0) - (dienstVan.get(b.dienstId)?.start ?? 0) || a.dienstId.localeCompare(b.dienstId) || a.naam.localeCompare(b.naam));
  return { toewijzingen, onvervuld, totaal: totalen(toewijzingen, diensten), oplosser: "intern", ms: Date.now() - t0 };
}

export function totalen(toewijzingen: Toewijzing[], diensten: PlanDienst[]): PlanResultaat["totaal"] {
  const plekken = diensten.reduce((s, d) => s + Math.max(0, d.plekken), 0);
  const gevuld = toewijzingen.length;
  return {
    loonCents: toewijzingen.reduce((s, t) => s + t.loonCents, 0),
    reisKm: Math.round(toewijzingen.reduce((s, t) => s + t.reisKm, 0) * 10) / 10,
    reisCents: toewijzingen.reduce((s, t) => s + t.reisCents, 0),
    plekken,
    gevuld,
    bezettingPct: plekken === 0 ? 100 : Math.round((gevuld / plekken) * 100),
  };
}

/** Alle haalbare kandidaten met kosten: de invoer voor de OR-Tools-dienst. */
export function kandidatenVoor(diensten: PlanDienst[], krachten: PlanKracht[], instellingen: Partial<PlanInstellingen> = {}): Kandidaat[] {
  const i = { ...STANDAARD_INSTELLINGEN, ...instellingen };
  return diensten.flatMap((d) => krachten.filter((k) => belemmeringen(d, k, i).length === 0).map((k) => kandidaat(d, k, i)));
}
