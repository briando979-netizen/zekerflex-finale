// ---------------------------------------------------------------------------
// Bronnen: gegevens van buiten die de server zelf ophaalt, op schema, zonder
// abonnement op een scraping-dienst. Elke bron heeft een vaste plek waar hij
// vandaan komt, een ritme (om de zoveel uur) en een lezer die van het ruwe
// antwoord (JSON, HTML, XML) nette waarden maakt. De lezers staan hier, puur,
// zodat ze los te testen zijn met een opgeslagen antwoord; het ophalen zelf
// zit in lib/bronnen/haal.ts en de Playwright-container in deploy/scraper.
// ---------------------------------------------------------------------------

export const BRON_IDS = ["brandstof", "minimumloon", "cao", "kvk", "schermen"] as const;
export type BronId = (typeof BRON_IDS)[number];

export interface Bron {
  id: BronId;
  naam: string;
  kort: string;
  /** waar de mens kan kijken */
  bronUrl: string;
  bronNaam: string;
  /** opnieuw ophalen na zoveel uur */
  elkeUur: number;
  /** wat ermee gebeurt in ZekerFlex */
  nut: string;
  /** via de headless browser (deploy/scraper) in plaats van een gewone fetch */
  browser: boolean;
}

export const BRONNEN: Record<BronId, Bron> = {
  brandstof: {
    id: "brandstof",
    naam: "Pompprijzen brandstof",
    kort: "Landelijke gemiddelde pompprijs per dag van Euro95, diesel en lpg",
    bronUrl: "https://opendata.cbs.nl/statline/#/CBS/nl/dataset/80416NED/table",
    bronNaam: "CBS StatLine (open data)",
    elkeUur: 24,
    nut: "Reiskosten en de rittenadministratie van werkers: de prijs van vandaag naast de € 0,23 per kilometer.",
    browser: false,
  },
  minimumloon: {
    id: "minimumloon",
    naam: "Wettelijk minimumuurloon",
    kort: "Het bruto minimumuurloon per leeftijd, zoals Rijksoverheid het publiceert (1 januari en 1 juli)",
    bronUrl: "https://www.rijksoverheid.nl/themas/werk/minimumloon/bedragen-minimumloon",
    bronNaam: "Rijksoverheid",
    elkeUur: 24 * 7,
    nut: "Controle dat geen enkel uurtarief op het platform onder het wettelijk minimum ligt; melding zodra het bedrag verandert.",
    browser: false,
  },
  cao: {
    id: "cao",
    naam: "Cao-bekendmakingen",
    kort: "Nieuwe besluiten en verzoeken tot algemeenverbindendverklaring van cao's in de Staatscourant",
    bronUrl: "https://zoek.officielebekendmakingen.nl/",
    bronNaam: "Officiële bekendmakingen (SRU)",
    elkeUur: 24,
    nut: "Wie uitzendt of detacheert moet cao-wijzigingen volgen; dit is de officiële lijst van de laatste twee weken.",
    browser: false,
  },
  kvk: {
    id: "kvk",
    naam: "KVK-controle van bedrijven",
    kort: "Elke week opnieuw opzoeken of de ingeschreven opdrachtgevers nog actief zijn in het Handelsregister",
    bronUrl: "https://www.kvk.nl/zoeken/",
    bronNaam: "Handelsregister (via KVKBase)",
    elkeUur: 24 * 7,
    nut: "Een opgeheven of failliet bedrijf valt direct op in Admin → Bedrijven, vóór er nog diensten worden ingepland.",
    browser: false,
  },
  schermen: {
    id: "schermen",
    naam: "Schermcontrole van de eigen site",
    kort: "Een echte browser (Playwright in Docker) opent elke dag de belangrijkste pagina's en maakt een schermafdruk",
    bronUrl: "https://zekerflex.com/",
    bronNaam: "ZekerFlex zelf",
    elkeUur: 6,
    nut: "Een wit scherm of een kapotte pagina na een uitrol valt zo op, ook als de server zelf 200 zegt.",
    browser: true,
  },
};

export const isBronId = (s: unknown): s is BronId => typeof s === "string" && (BRON_IDS as readonly string[]).includes(s);

/** Eén opgehaalde stand van een bron: de waarden plus een korte regel voor mensen. */
export interface Meting {
  op: string;
  ok: boolean;
  /** de belangrijkste getallen/teksten, per bron vastgelegd (zie de lezers hieronder) */
  waarden: Record<string, number | string | null>;
  /** één regel: "Euro95 € 2,31 · diesel € 2,46 (3 nov)" */
  tekst: string;
  /** extra regels: lijst van cao's, pagina's, bedrijven */
  regels: { tekst: string; url?: string; toon?: "ok" | "let-op" | "fout" }[];
  fout: string;
  duurMs: number;
}

export const lege = (fout: string): Omit<Meting, "op" | "duurMs"> => ({ ok: false, waarden: {}, tekst: "", regels: [], fout });

const euro = (n: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(n);
const dagKort = (iso: string) => new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));

// ── 1. Pompprijzen (CBS StatLine 80416NED) ───────────────────────────────────

export interface Pompprijs {
  datum: string;
  benzine: number;
  diesel: number;
  lpg: number;
}

/** "20261020" → "2026-10-20" */
const cbsDatum = (p: string) => `${p.slice(0, 4)}-${p.slice(4, 6)}-${p.slice(6, 8)}`;

/** Het JSON-antwoord van de OData-API naar een reeks per dag, oud → nieuw. */
export function leesPompprijzen(json: unknown): Pompprijs[] {
  const value = (json as { value?: unknown } | null)?.value;
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((r) => {
      const x = (r ?? {}) as Record<string, unknown>;
      const p = typeof x.Perioden === "string" ? x.Perioden.trim() : "";
      const b = Number(x.BenzineEuro95_1);
      const d = Number(x.Diesel_2);
      const l = Number(x.Lpg_3);
      return /^\d{8}$/.test(p) && Number.isFinite(b) && b > 0 ? [{ datum: cbsDatum(p), benzine: b, diesel: Number.isFinite(d) ? d : 0, lpg: Number.isFinite(l) ? l : 0 }] : [];
    })
    .sort((a, b) => a.datum.localeCompare(b.datum));
}

export function metingPompprijzen(reeks: Pompprijs[]): Omit<Meting, "op" | "duurMs"> {
  const laatste = reeks[reeks.length - 1];
  if (!laatste) return lege("Het CBS gaf geen pompprijzen terug.");
  const week = reeks[Math.max(0, reeks.length - 8)];
  const verschil = week ? laatste.benzine - week.benzine : 0;
  return {
    ok: true,
    waarden: { datum: laatste.datum, benzine: laatste.benzine, diesel: laatste.diesel, lpg: laatste.lpg, benzineWeekVerschil: Number(verschil.toFixed(3)) },
    tekst: `Euro95 ${euro(laatste.benzine)} · diesel ${euro(laatste.diesel)} · lpg ${euro(laatste.lpg)} per liter (${dagKort(laatste.datum)})`,
    regels: week ? [{ tekst: `Euro95 ${verschil >= 0 ? "+" : "−"}${euro(Math.abs(verschil))} ten opzichte van een week eerder` }] : [],
    fout: "",
  };
}

// ── 2. Minimumuurloon (Rijksoverheid) ────────────────────────────────────────

const MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

export interface MinimumloonTabel {
  /** "2026-07-01" */
  geldigVanaf: string;
  /** per leeftijd (15 t/m 21 = "21 jaar en ouder"), bruto per uur */
  perUur: Record<number, number>;
}

/** De tabellen uit de HTML-pagina: per ingangsdatum het uurloon per leeftijd. */
export function leesMinimumloon(html: string): MinimumloonTabel[] {
  const tekst = html.replace(/<[^>]+>/g, " ").replace(/&nbsp;|&lt;|&gt;|&amp;/g, " ").replace(/\s+/g, " ");
  const uit: MinimumloonTabel[] = [];
  const kop = /Bedragen per (\d{1,2}) (\w+) (\d{4})/g;
  let m: RegExpExecArray | null;
  const koppen: { index: number; datum: string }[] = [];
  while ((m = kop.exec(tekst))) {
    const maand = MAANDEN.indexOf((m[2] ?? "").toLowerCase());
    if (maand < 0) continue;
    koppen.push({ index: m.index, datum: `${m[3]}-${String(maand + 1).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}` });
  }
  koppen.forEach((k, i) => {
    const blok = tekst.slice(k.index, koppen[i + 1]?.index ?? k.index + 2500);
    const perUur: Record<number, number> = {};
    const rij = /(\d{2}) jaar(?: en ouder)? € ?(\d{1,2},\d{2})/g;
    let r: RegExpExecArray | null;
    while ((r = rij.exec(blok))) {
      const leeftijd = Number(r[1]);
      const bedrag = Number((r[2] ?? "").replace(",", "."));
      if (leeftijd >= 15 && leeftijd <= 21 && Number.isFinite(bedrag) && !(leeftijd in perUur)) perUur[leeftijd] = bedrag;
    }
    if (perUur[21]) uit.push({ geldigVanaf: k.datum, perUur });
  });
  return uit.sort((a, b) => a.geldigVanaf.localeCompare(b.geldigVanaf));
}

/** Welke tabel vandaag geldt (de laatste met een ingangsdatum ≤ vandaag), en de volgende. */
export function metingMinimumloon(tabellen: MinimumloonTabel[], vandaag: string): Omit<Meting, "op" | "duurMs"> {
  const geldig = [...tabellen].reverse().find((t) => t.geldigVanaf <= vandaag) ?? tabellen[0];
  if (!geldig) return lege("Geen bedragen gevonden op de pagina van Rijksoverheid (is de opmaak veranderd?).");
  const volgend = tabellen.find((t) => t.geldigVanaf > vandaag);
  const u21 = geldig.perUur[21] ?? 0;
  return {
    ok: true,
    waarden: { geldigVanaf: geldig.geldigVanaf, uurloon21: u21, uurloon18: geldig.perUur[18] ?? null, uurloon16: geldig.perUur[16] ?? null, volgendVanaf: volgend?.geldigVanaf ?? null, volgendUurloon21: volgend?.perUur[21] ?? null },
    tekst: `${euro(u21)} per uur bruto (21 jaar en ouder) sinds ${dagKort(geldig.geldigVanaf)} ${geldig.geldigVanaf.slice(0, 4)}`,
    regels: [
      ...[21, 20, 19, 18, 17, 16, 15].flatMap((l) => (geldig.perUur[l] ? [{ tekst: `${l === 21 ? "21 jaar en ouder" : `${l} jaar`}: ${euro(geldig.perUur[l] ?? 0)}` }] : [])),
      ...(volgend ? [{ tekst: `Per ${dagKort(volgend.geldigVanaf)} ${volgend.geldigVanaf.slice(0, 4)}: ${euro(volgend.perUur[21] ?? 0)} (21+)`, toon: "let-op" as const }] : []),
    ],
    fout: "",
  };
}

// ── 3. Cao-bekendmakingen (SRU van overheid.nl) ──────────────────────────────

export interface Bekendmaking {
  titel: string;
  datum: string;
  url: string;
}

/** De records uit het SRU-antwoord (XML): titel, datum, link naar de bekendmaking. */
export function leesBekendmakingen(xml: string): Bekendmaking[] {
  const uit: Bekendmaking[] = [];
  const rec = /<sru:record>([\s\S]*?)<\/sru:record>/g;
  let m: RegExpExecArray | null;
  const ont = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
  while ((m = rec.exec(xml))) {
    const r = m[1] ?? "";
    const titel = /<dcterms:title>([^<]*)<\/dcterms:title>/.exec(r)?.[1];
    const datum = /<dcterms:(?:available|modified)>(\d{4}-\d{2}-\d{2})/.exec(r)?.[1];
    const url = /<gzd:preferredUrl>([^<]*)<\/gzd:preferredUrl>/.exec(r)?.[1];
    if (titel && datum) uit.push({ titel: ont(titel).slice(0, 220), datum, url: url ? ont(url) : "" });
  }
  return uit.sort((a, b) => b.datum.localeCompare(a.datum));
}

const korteCaoTitel = (t: string) =>
  t
    .replace(/^Besluit van de Minister van Sociale Zaken en Werkgelegenheid van \d{1,2} \w+ \d{4} tot /i, "")
    .replace(/^wijziging van het besluit tot /i, "wijziging: ")
    .replace(/algemeenverbindendverklaring van bepalingen van de collectieve arbeidsovereenkomst/gi, "avv cao")
    .replace(/^\w/, (c) => c.toUpperCase());

export function metingBekendmakingen(lijst: Bekendmaking[], vandaag: string): Omit<Meting, "op" | "duurMs"> {
  const grens = new Date(Date.parse(`${vandaag}T00:00:00Z`) - 14 * 86_400_000).toISOString().slice(0, 10);
  const recent = lijst.filter((b) => b.datum >= grens);
  const besluiten = recent.filter((b) => /^Besluit/i.test(b.titel)).length;
  return {
    ok: true,
    waarden: { laatsteTweeWeken: recent.length, besluiten, verzoeken: recent.length - besluiten, nieuwste: lijst[0]?.datum ?? null },
    tekst: recent.length ? `${recent.length} ${recent.length === 1 ? "bekendmaking" : "bekendmakingen"} in de laatste twee weken (${besluiten} ${besluiten === 1 ? "besluit" : "besluiten"})` : "Geen nieuwe cao-bekendmakingen in de laatste twee weken",
    regels: recent.slice(0, 12).map((b) => ({ tekst: `${dagKort(b.datum)}: ${korteCaoTitel(b.titel)}`, ...(b.url ? { url: b.url } : {}) })),
    fout: "",
  };
}

// ── 5. Schermcontrole (Playwright) ───────────────────────────────────────────

export interface Schermafdruk {
  pad: string;
  status: number;
  /** aandeel van de meest voorkomende kleur: ~1 = leeg scherm */
  dominant: number;
  titel: string;
  ms: number;
  fout: string;
}

/** Vanaf dit aandeel van één kleur is een pagina "leeg" (wit scherm, foutpagina zonder inhoud). */
export const LEEG_VANAF = 0.985;

export function metingSchermen(lijst: Schermafdruk[]): Omit<Meting, "op" | "duurMs"> {
  const leeg = lijst.filter((s) => s.fout || s.status >= 400 || s.dominant >= LEEG_VANAF);
  return {
    ok: leeg.length === 0,
    waarden: { paginas: lijst.length, inOrde: lijst.length - leeg.length, leeg: leeg.length, traagsteMs: Math.max(0, ...lijst.map((s) => s.ms)) },
    tekst: leeg.length ? `${leeg.length} van ${lijst.length} pagina's niet in orde: ${leeg.map((s) => s.pad).join(", ")}` : `Alle ${lijst.length} pagina's tonen inhoud (traagste ${Math.max(0, ...lijst.map((s) => s.ms))} ms)`,
    regels: lijst.map((s) => ({
      tekst: `${s.pad}: ${s.fout ? s.fout : s.status >= 400 ? `status ${s.status}` : s.dominant >= LEEG_VANAF ? `leeg scherm (${Math.round(s.dominant * 100)}% één kleur)` : `${s.titel || "zonder titel"} · ${s.ms} ms`}`,
      toon: s.fout || s.status >= 400 || s.dominant >= LEEG_VANAF ? ("fout" as const) : ("ok" as const),
    })),
    fout: leeg.length ? "Niet elke pagina toont inhoud." : "",
  };
}
