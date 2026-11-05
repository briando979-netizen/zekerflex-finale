// ---------------------------------------------------------------------------
// Documenten lezen (4 nov 2026): uit de tekst die de OCR vindt (lib/ocr/engine.ts)
// halen we wat de app kan invullen: het soort certificaat, het nummer, de
// afgifte- en vervaldatum, het totaalbedrag en de datum van een bon, en een
// KVK- of btw-nummer. Alles is een voorstel: de gebruiker controleert het.
// Puur, dus los te testen (tests/ocr-lezen.test.ts).
// ---------------------------------------------------------------------------

export interface Gelezen {
  /** het soort certificaat, als dat eruit te halen is (CERT_TYPES-sleutel) */
  certType: string | null;
  nummer: string | null;
  /** YYYY-MM-DD */
  afgegevenOp: string | null;
  geldigTot: string | null;
  /** een bon: het totaal in centen en de datum */
  bedragCents: number | null;
  bonDatum: string | null;
  kvk: string | null;
  btw: string | null;
  /** alle datums die gevonden zijn, in volgorde van voorkomen */
  datums: string[];
  /** wat voor document het lijkt */
  soort: "certificaat" | "bon" | "uittreksel" | "onbekend";
}

const MAANDEN: Record<string, number> = {
  januari: 1, jan: 1, january: 1,
  februari: 2, feb: 2, february: 2,
  maart: 3, mrt: 3, march: 3, mar: 3,
  april: 4, apr: 4,
  mei: 5, may: 5,
  juni: 6, jun: 6, june: 6,
  juli: 7, jul: 7, july: 7,
  augustus: 8, aug: 8, august: 8,
  september: 9, sep: 9, sept: 9,
  oktober: 10, okt: 10, october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
};

const pad = (n: number) => String(n).padStart(2, "0");
const geldigeDatum = (j: number, m: number, d: number) => j >= 1950 && j <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31;
const iso = (j: number, m: number, d: number) => (geldigeDatum(j, m, d) ? `${j}-${pad(m)}-${pad(d)}` : null);

/** De OCR leest een 0 soms als O en een 1 als l of I; in een cijfergroep zetten we dat terug. */
const cijfers = (s: string) => s.replace(/[Oo]/g, "0").replace(/[lI]/g, "1");
/** een cijfergroep zoals de OCR hem kan teruggeven */
const C = "[\\dOolI]";
const DATUM_DMJ = new RegExp(`(?<!\\d)(${C}{1,2})[-/.](${C}{1,2})[-/.](${C}{4})(?!\\d)`);
const DATUM_TEKST = new RegExp(`(?<!\\d)(${C}{1,2})\\s+([a-zA-Z]{3,9})\\.?\\s+(${C}{4})(?!\\d)`);

/** Een datum in een stuk tekst: 12-05-2034, 12/05/2034, 12.05.2034, 2034-05-12, 12 mei 2034, 12 May 2034. */
export function leesDatum(s: string): string | null {
  const t = s.replace(/\s+/g, " ");
  let m = DATUM_DMJ.exec(t);
  if (m) return iso(Number(cijfers(m[3]!)), Number(cijfers(m[2]!)), Number(cijfers(m[1]!)));
  m = /(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/.exec(t);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = DATUM_TEKST.exec(t);
  if (m) {
    const maand = MAANDEN[m[2]!.toLowerCase()];
    if (maand) return iso(Number(cijfers(m[3]!)), maand, Number(cijfers(m[1]!)));
  }
  return null;
}

/** Alle datums in de tekst, in volgorde. */
export function alleDatums(tekst: string): string[] {
  const uit: string[] = [];
  const re = new RegExp(`${C}{1,2}[-/.]${C}{1,2}[-/.]${C}{4}|\\d{4}-\\d{2}-\\d{2}|${C}{1,2}\\s+[a-zA-Z]{3,9}\\.?\\s+${C}{4}`, "g");
  for (const m of tekst.matchAll(re)) {
    const d = leesDatum(m[0]);
    if (d) uit.push(d);
  }
  return uit;
}

const regelMet = (tekst: string, woorden: RegExp): string | null => {
  for (const regel of tekst.split(/\n/)) if (woorden.test(regel)) return regel;
  return null;
};

/** De datum achter een label ("Geldig tot: 12-05-2034"), ook als hij op de volgende regel staat. */
function datumBij(tekst: string, label: RegExp): string | null {
  const regels = tekst.split(/\n/);
  for (let i = 0; i < regels.length; i++) {
    const r = regels[i]!;
    const m = label.exec(r);
    if (!m) continue;
    const na = r.slice(m.index + m[0].length);
    const d = leesDatum(na) ?? (regels[i + 1] ? leesDatum(regels[i + 1]!) : null);
    if (d) return d;
  }
  return null;
}

const CERT_WOORDEN: [string, RegExp][] = [
  ["VCA_VOL", /vca[\s-]*vol|vol[\s-]*vca|veiligheid voor operationeel leidinggevenden/i],
  ["VCA_BASIS", /b[\s-]*vca|basisveiligheid|vca[\s-]*basis|vca/i],
  ["BHV", /\bbhv\b|bedrijfshulpverlen/i],
  ["EHBO", /\behbo\b|eerste hulp/i],
  ["REACHTRUCK", /reachtruck|reach[\s-]*truck/i],
  ["HEFTRUCK", /heftruck|vorkheftruck|forklift/i],
  ["RIJBEWIJS_D", /rijbewijs\s*d\b|categorie\s*d\b/i],
  ["RIJBEWIJS_C", /rijbewijs\s*c\b|categorie\s*c\b|code\s*95/i],
  ["RIJBEWIJS_B", /rijbewijs\s*b\b|categorie\s*b\b|driving licence/i],
  ["SVH", /sociale hygi[eë]ne|\bsvh\b/i],
];

const EURO = /(?:€|eur)\s*(\d{1,5})[.,](\d{2})\b|\b(\d{1,5}),(\d{2})\b/gi;

/** Alle bedragen (centen) in de tekst, met of er "totaal" op de regel stond. */
function bedragen(tekst: string): { cents: number; totaal: boolean }[] {
  const uit: { cents: number; totaal: boolean }[] = [];
  for (const regel of tekst.split(/\n/)) {
    const totaal = /totaal|total|te betalen|bedrag/i.test(regel);
    for (const m of regel.matchAll(EURO)) {
      const heel = m[1] ?? m[3];
      const rest = m[2] ?? m[4];
      if (heel === undefined || rest === undefined) continue;
      const cents = Number(heel) * 100 + Number(rest);
      if (cents > 0 && cents <= 5_000_000) uit.push({ cents, totaal });
    }
  }
  return uit;
}

/** "KVK 12345678" / "KvK-nummer: 12345678". */
export function leesKvk(tekst: string): string | null {
  const m = /k\.?v\.?k\.?[^0-9]{0,20}(\d{8})\b/i.exec(tekst) ?? /handelsregister[^0-9]{0,30}(\d{8})\b/i.exec(tekst);
  return m?.[1] ?? null;
}

/**
 * Een btw-id: NL001234567B01 (met of zonder spaties/punten; een O of l tussen
 * de cijfers is een 0 of 1, en achter de B nemen we de eerste twee tekens:
 * de OCR plakt daar soms een teken bij).
 */
export function leesBtw(tekst: string): string | null {
  const m = new RegExp(`\\bNL\\s?(${C}{3})\\s?(${C}{3})\\s?(${C}{3})\\s?B\\s?(${C}{2,3})(?![\\dA-Z])`, "i").exec(tekst.replace(/\./g, ""));
  if (!m) return null;
  const nummer = cijfers(m[1]! + m[2]! + m[3]!);
  if (!/^\d{9}$/.test(nummer)) return null;
  return `NL${nummer}B${cijfers(m[4]!).slice(0, 2)}`;
}

/** Het certificaat- of diplomanummer achter een label. */
export function leesNummer(tekst: string): string | null {
  const regel = regelMet(tekst, /(certificaat|diploma|pas|registratie)[\s-]*(nummer|nr|no)\b|\bnummer\s*:|\bnr\.?\s*:|certificate\s*(no|number)/i);
  if (!regel) return null;
  const na = regel.replace(/^.*?(nummer|nr\.?|no\.?|number)\s*[:.]?\s*/i, "");
  const m = /([A-Z0-9][A-Z0-9.\-/]{3,31})/i.exec(na);
  return m ? m[1]!.replace(/[.\-/]+$/, "") : null;
}

/** Alles wat we uit de tekst kunnen halen. */
export function leesDocument(tekst: string): Gelezen {
  const t = tekst.replace(/\r/g, "");
  const datums = alleDatums(t);
  const certType = CERT_WOORDEN.find(([, re]) => re.test(t))?.[0] ?? null;
  const geldigTot = datumBij(t, /geldig\s*(tot|t\/m|tot en met)|verloopt( op)?|vervaldatum|valid (until|to|thru)|expir(es|y)( date)?|einddatum/i);
  const afgegevenOp = datumBij(t, /afgegeven( op)?|afgiftedatum|uitgegeven( op)?|examendatum|datum (van )?(afgifte|uitgifte|examen)|behaald op|issued( on)?|date of issue/i);
  const kvk = leesKvk(t);
  const btw = leesBtw(t);
  const lijst = bedragen(t);
  const totaalRegel = lijst.filter((b) => b.totaal);
  const bedragCents = totaalRegel.length ? Math.max(...totaalRegel.map((b) => b.cents)) : lijst.length ? Math.max(...lijst.map((b) => b.cents)) : null;
  const lijktBon = /totaal|total|btw|bon|kassa|pin|contant|pomp|liter/i.test(t) && bedragCents !== null;
  const lijktUittreksel = /uittreksel|handelsregister|kamer van koophandel/i.test(t);
  const soort: Gelezen["soort"] = certType ? "certificaat" : lijktUittreksel ? "uittreksel" : lijktBon ? "bon" : "onbekend";
  const bonDatum = soort === "bon" ? (datumBij(t, /datum|date/i) ?? datums[0] ?? null) : null;
  return {
    certType,
    nummer: leesNummer(t),
    afgegevenOp: afgegevenOp ?? (certType && !geldigTot ? (datums[0] ?? null) : null),
    geldigTot: geldigTot ?? (certType && datums.length >= 2 ? (datums[datums.length - 1] ?? null) : null),
    bedragCents: soort === "bon" ? bedragCents : null,
    bonDatum,
    kvk,
    btw,
    datums,
    soort,
  };
}
