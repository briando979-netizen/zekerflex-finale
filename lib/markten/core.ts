// De marktscanner (Admin → Markten): rekent uit koersen een rendement, de
// schommeling en de trend uit en zet daar een neutraal label op. Puur: geen
// netwerk, geen database. Alles is een signaal om te volgen, NOOIT een
// beleggingsadvies en nooit een opdracht; ZekerFlex handelt niet zelf.

export type Soort = "crypto" | "memecoin" | "goud" | "zilver" | "olie" | "tech" | "index";

export type Koers = { datum: string; slot: number };
export type Activum = { id: string; naam: string; soort: Soort; bron: "coingecko" | "yahoo"; symbool: string };

export type Signaal =
  | "sterke-stijging" // opwaartse trend, boven het 20-daags gemiddelde
  | "herstel" // na een dip weer omhoog
  | "dip" // flink gedaald, nog geen herstel
  | "oververhit" // extreem snel gestegen: kans op terugval
  | "onrustig" // grote schommelingen
  | "neutraal";

export type Analyse = {
  id: string;
  naam: string;
  soort: Soort;
  laatste: number;
  r1: number | null; // % 1 dag
  r7: number | null;
  r30: number | null;
  schommeling: number | null; // standaarddeviatie van dagrendementen over 30 dagen, in %
  boven20: boolean | null;
  dalingVanTop: number | null; // % onder de hoogste koers van de laatste 30 dagen
  signaal: Signaal;
  /** 0 (rustig) – 100 (zeer risicovol) */
  risico: number;
  uitleg: string;
};

const pct = (nu: number, toen: number): number | null => (toen > 0 && Number.isFinite(nu) && Number.isFinite(toen) ? ((nu - toen) / toen) * 100 : null);
const rond = (n: number | null, d = 1): number | null => (n === null ? null : Math.round(n * 10 ** d) / 10 ** d);

/** Koersen uit het antwoord van Yahoo Finance (chart, dagkoersen); oudste eerst, lege dagen overgeslagen. */
export function parseYahoo(json: unknown): Koers[] {
  const r = (json as { chart?: { result?: { timestamp?: number[]; indicators?: { quote?: { close?: (number | null)[] }[] } }[] } } | null)?.chart?.result?.[0];
  const t = r?.timestamp ?? [];
  const c = r?.indicators?.quote?.[0]?.close ?? [];
  const uit: Koers[] = [];
  for (let i = 0; i < t.length; i++) {
    const slot = c[i];
    const ts = t[i];
    if (typeof slot === "number" && Number.isFinite(slot) && slot > 0 && typeof ts === "number") uit.push({ datum: new Date(ts * 1000).toISOString().slice(0, 10), slot });
  }
  return uit.sort((a, b) => a.datum.localeCompare(b.datum));
}

/** Een munt uit CoinGecko /coins/markets: prijs en de procentuele veranderingen die CoinGecko zelf geeft. */
export type CoinMarkt = { id: string; symbol: string; name: string; current_price: number; price_change_percentage_24h_in_currency?: number | null; price_change_percentage_7d_in_currency?: number | null; price_change_percentage_30d_in_currency?: number | null; high_24h?: number | null; low_24h?: number | null; ath_change_percentage?: number | null };

export function risicoVan(schommeling: number | null, soort: Soort): number {
  const basis = soort === "memecoin" ? 55 : soort === "crypto" ? 35 : soort === "tech" ? 20 : soort === "olie" ? 20 : 10;
  return Math.max(0, Math.min(100, Math.round(basis + (schommeling ?? 0) * 6)));
}

function label(a: { r7: number | null; r30: number | null; boven20: boolean | null; schommeling: number | null; dalingVanTop: number | null }): Signaal {
  const { r7, r30, boven20, schommeling, dalingVanTop } = a;
  if (r7 !== null && r7 > 40) return "oververhit";
  if (schommeling !== null && schommeling > 6) return "onrustig";
  if (r7 !== null && r7 > 5 && boven20 === true) return "sterke-stijging";
  if (r30 !== null && r30 < -15 && r7 !== null && r7 > 2) return "herstel";
  if (r30 !== null && r30 < -15 && (dalingVanTop ?? 0) > 20) return "dip";
  return "neutraal";
}

const UITLEG: Record<Signaal, string> = {
  "sterke-stijging": "Stijgt sterk en staat boven het gemiddelde van de laatste 20 dagen: een opwaartse trend om te volgen.",
  herstel: "Was flink gedaald en trekt nu weer aan: kijk of het herstel doorzet.",
  dip: "Flink gedaald en nog geen herstel: kan een kans zijn of nog verder zakken.",
  oververhit: "In een week extreem hard gestegen: de kans op een forse terugval is groot.",
  onrustig: "Schommelt hevig van dag tot dag: wees voorzichtig met de hoogte van een eventuele inzet.",
  neutraal: "Geen duidelijk signaal.",
};

/** Analyse uit een koersreeks (oudste eerst, bij voorkeur 30+ dagen). */
export function analyseerReeks(act: Pick<Activum, "id" | "naam" | "soort">, koersen: Koers[]): Analyse | null {
  if (koersen.length < 8) return null;
  const p = koersen.map((k) => k.slot);
  const nu = p[p.length - 1] as number;
  const terug = (d: number) => (p.length > d ? (p[p.length - 1 - d] as number) : null);
  const r1 = terug(1) === null ? null : pct(nu, terug(1) as number);
  const r7 = terug(7) === null ? null : pct(nu, terug(7) as number);
  const r30 = terug(30) === null ? null : pct(nu, terug(30) as number);
  const laatste30 = p.slice(-31);
  const dag: number[] = [];
  for (let i = 1; i < laatste30.length; i++) dag.push(((laatste30[i] as number) / (laatste30[i - 1] as number) - 1) * 100);
  const gem = dag.reduce((s, x) => s + x, 0) / (dag.length || 1);
  const schommeling = dag.length >= 5 ? Math.sqrt(dag.reduce((s, x) => s + (x - gem) ** 2, 0) / dag.length) : null;
  const sma20 = p.length >= 20 ? p.slice(-20).reduce((s, x) => s + x, 0) / 20 : null;
  const top = Math.max(...laatste30);
  const dalingVanTop = pct(nu, top);
  const velden = { r7, r30, boven20: sma20 === null ? null : nu > sma20, schommeling, dalingVanTop: dalingVanTop === null ? null : -dalingVanTop };
  const signaal = label(velden);
  return {
    id: act.id,
    naam: act.naam,
    soort: act.soort,
    laatste: nu,
    r1: rond(r1),
    r7: rond(r7),
    r30: rond(r30),
    schommeling: rond(schommeling),
    boven20: velden.boven20,
    dalingVanTop: rond(velden.dalingVanTop),
    signaal,
    risico: risicoVan(schommeling, act.soort),
    uitleg: UITLEG[signaal],
  };
}

/** Analyse uit de cijfers die CoinGecko al geeft (geen koersreeks nodig). */
export function analyseerCoin(c: CoinMarkt, soort: Soort): Analyse {
  const r1 = c.price_change_percentage_24h_in_currency ?? null;
  const r7 = c.price_change_percentage_7d_in_currency ?? null;
  const r30 = c.price_change_percentage_30d_in_currency ?? null;
  const dag = c.high_24h && c.low_24h && c.current_price ? ((c.high_24h - c.low_24h) / c.current_price) * 100 : null;
  const schommeling = dag === null ? null : dag / 2.5; // grove schatting van de dagelijkse spreiding uit de dagrange
  const boven20 = r30 === null ? null : r30 > 0 && (r7 ?? 0) > 0;
  const velden = { r7, r30, boven20, schommeling, dalingVanTop: null };
  const signaal = label(velden);
  return {
    id: c.id,
    naam: `${c.name} (${c.symbol.toUpperCase()})`,
    soort,
    laatste: c.current_price,
    r1: rond(r1),
    r7: rond(r7),
    r30: rond(r30),
    schommeling: rond(schommeling),
    boven20,
    dalingVanTop: null,
    signaal,
    risico: risicoVan(schommeling, soort),
    uitleg: UITLEG[signaal],
  };
}

/** Wat het meest de moeite van het volgen waard is: eerst duidelijke signalen, dan de lagere risico's. */
export function kiesKansen(lijst: Analyse[], max = 5): Analyse[] {
  const waarde: Record<Signaal, number> = { "sterke-stijging": 3, herstel: 3, dip: 2, neutraal: 0, onrustig: 0, oververhit: -1 };
  return [...lijst]
    .filter((a) => waarde[a.signaal] > 0)
    .sort((a, b) => waarde[b.signaal] - waarde[a.signaal] || a.risico - b.risico)
    .slice(0, max);
}

/**
 * Een voorgestelde inzet als percentage van het speelgeld dat de eigenaar zelf instelde,
 * kleiner naarmate het risico hoger is (hoogstens 20 %, minstens 2 %). Zonder budget: niets.
 */
export function voorstelBedragCents(risico: number, budgetCents: number): number {
  if (!Number.isFinite(budgetCents) || budgetCents <= 0) return 0;
  const pctInzet = Math.max(2, Math.min(20, 22 - risico * 0.2));
  return Math.floor((budgetCents * pctInzet) / 100);
}

export const AFWIJZING =
  "Dit zijn signalen uit openbare koersen, geen beleggingsadvies. Beleggen in crypto, grondstoffen en aandelen kan geld kosten, bij memecoins zelfs alles. Zet alleen in wat je kunt missen. ZekerFlex voert zelf geen handel uit.";

/** De activa die we volgen: gratis bronnen zonder sleutel (CoinGecko, Yahoo Finance). */
export const ACTIVA: Activum[] = [
  { id: "goud", naam: "Goud (USD/oz)", soort: "goud", bron: "yahoo", symbool: "GC=F" },
  { id: "zilver", naam: "Zilver (USD/oz)", soort: "zilver", bron: "yahoo", symbool: "SI=F" },
  { id: "olie-wti", naam: "Olie WTI", soort: "olie", bron: "yahoo", symbool: "CL=F" },
  { id: "olie-brent", naam: "Olie Brent", soort: "olie", bron: "yahoo", symbool: "BZ=F" },
  { id: "nasdaq100", naam: "Nasdaq 100", soort: "index", bron: "yahoo", symbool: "^NDX" },
  { id: "sp500", naam: "S&P 500", soort: "index", bron: "yahoo", symbool: "^GSPC" },
  { id: "nvda", naam: "NVIDIA", soort: "tech", bron: "yahoo", symbool: "NVDA" },
  { id: "msft", naam: "Microsoft", soort: "tech", bron: "yahoo", symbool: "MSFT" },
  { id: "aapl", naam: "Apple", soort: "tech", bron: "yahoo", symbool: "AAPL" },
  { id: "tsla", naam: "Tesla", soort: "tech", bron: "yahoo", symbool: "TSLA" },
  { id: "asml", naam: "ASML", soort: "tech", bron: "yahoo", symbool: "ASML.AS" },
];

/** Bekende memecoins (voor de soort); trending munten van CoinGecko die hier niet in staan, tellen als memecoin als ze klein zijn. */
export const MEMECOINS = new Set(["dogecoin", "shiba-inu", "pepe", "bonk", "dogwifcoin", "floki", "book-of-meme", "brett-based", "popcat", "mog-coin"]);
export const soortCoin = (id: string, marktwaardeRang: number | null): Soort => (MEMECOINS.has(id) || (marktwaardeRang !== null && marktwaardeRang > 150) ? "memecoin" : "crypto");
