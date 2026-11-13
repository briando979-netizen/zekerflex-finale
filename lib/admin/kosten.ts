// ---------------------------------------------------------------------------
// Beheer -> Kosten: wat het platform kost, per maand en per jaar. Pure kern (geen prisma, kv of zod), zodat ook het
// scherm hem mag inlezen en een test hem kan doorrekenen.
//
// Strikt gescheiden:
//  - "gemeten":   komt uit een API (TransIP-facturen); staat in lib/admin/kosten-transip.ts, niet in deze lijst.
//  - "handmatig": een opgave van een mens, altijd met bron en datum. Telt mee in het vaststaande totaal.
//  - "schatting": een inschatting die nog bevestigd moet worden. Telt NOOIT mee in het vaststaande totaal.
// Een bedrag dat we niet weten is null ("bedrag onbekend"): het telt niet mee en wordt nooit verzonnen.
// ---------------------------------------------------------------------------

export const BTW_PCT = 21;
/** Alleen voor een omgerekende weergave van dollars; een aanname, geen koers van de bank. */
export const USD_NAAR_EUR = 0.92;

export type KostenSoort = "handmatig" | "schatting";
export type Munt = "EUR" | "USD";
export type Per = "maand" | "jaar" | "eenmalig";

export interface KostenPost {
  id: string;
  naam: string;
  soort: KostenSoort;
  /** in centen, in de eigen munt, zonder btw; null = bedrag onbekend */
  bedragCent: number | null;
  munt: Munt;
  per: Per;
  /** btw-percentage dat bij dit bedrag hoort; null = niet bekend (dan komt er bij "incl. btw" niets bij) */
  btwPct: number | null;
  /** waar het bedrag vandaan komt */
  bron: string;
  /** ISO-datum (JJJJ-MM-DD) van de bron; null = datum onbekend */
  datum: string | null;
  opmerking?: string | undefined;
}

export interface KostenStand {
  posten: KostenPost[];
  /** telt op bij elke wijziging; de server geeft hem terug */
  versie: number;
  bijgewerktOp: string | null;
}

export const SCHATTING_LABEL = "schatting, accountant moet bevestigen";

const GENOTEERD = "2026-11-13";

/** De startgegevens (13 nov 2026), alleen met bron en datum. Wat niet bekend is, is "bedrag onbekend". */
export const STANDAARD_POSTEN: KostenPost[] = [
  { id: "claude", naam: "Claude", soort: "handmatig", bedragCent: 20_000, munt: "EUR", per: "maand", btwPct: null, bron: "opgave eigenaar", datum: GENOTEERD },
  { id: "twilio-nummer", naam: "Twilio nummer 097", soort: "handmatig", bedragCent: 770, munt: "USD", per: "maand", btwPct: null, bron: "Twilio-prijs, eerder gemeten", datum: null },
  { id: "twilio-gebruik", naam: "Twilio gebruik (bellen en sms)", soort: "handmatig", bedragCent: null, munt: "USD", per: "maand", btwPct: null, bron: "per verbruik, nog niet opgevraagd", datum: GENOTEERD },
  { id: "apple", naam: "Apple Developer", soort: "handmatig", bedragCent: 9_900, munt: "EUR", per: "jaar", btwPct: null, bron: "notitie 9 nov (de eigenaar betaalt Apple)", datum: "2026-11-09" },
  { id: "transip-server", naam: "TransIP server (VPS)", soort: "handmatig", bedragCent: 16_400, munt: "EUR", per: "maand", btwPct: BTW_PCT, bron: "TransIP-API, gemeten (excl. btw)", datum: "2026-11-12" },
  { id: "transip-oude-server", naam: "TransIP oude server", soort: "handmatig", bedragCent: 1_000, munt: "EUR", per: "maand", btwPct: BTW_PCT, bron: "TransIP-API, gemeten (excl. btw)", datum: "2026-11-12" },
  { id: "transip-domein", naam: "Domein zekerflex.com", soort: "handmatig", bedragCent: 899, munt: "EUR", per: "jaar", btwPct: BTW_PCT, bron: "TransIP-API, gemeten (excl. btw)", datum: "2026-11-12" },
  { id: "transip-onbekend", naam: "TransIP onbekende post", soort: "handmatig", bedragCent: 100, munt: "EUR", per: "eenmalig", btwPct: BTW_PCT, bron: "TransIP-API, gemeten (excl. btw)", datum: "2026-11-12", opmerking: "Wat dit is en hoe vaak het terugkomt, is niet vastgesteld; daarom niet in de maand- en jaartotalen." },
  { id: "gemini", naam: "Gemini (AI)", soort: "handmatig", bedragCent: null, munt: "EUR", per: "maand", btwPct: null, bron: "nog niet opgevraagd", datum: GENOTEERD },
  { id: "stripe-kosten", naam: "Stripe-kosten", soort: "handmatig", bedragCent: null, munt: "EUR", per: "maand", btwPct: null, bron: "nog niet opgevraagd", datum: GENOTEERD },
  { id: "atlas-kosten", naam: "Atlas-kosten", soort: "handmatig", bedragCent: null, munt: "USD", per: "jaar", btwPct: null, bron: "nog niet opgevraagd", datum: GENOTEERD },
  { id: "google-play", naam: "Google Play", soort: "handmatig", bedragCent: null, munt: "USD", per: "jaar", btwPct: null, bron: "nog niet opgevraagd", datum: GENOTEERD },
  { id: "delaware-franchise-tax", naam: "Delaware franchise tax", soort: "schatting", bedragCent: 40_000, munt: "USD", per: "jaar", btwPct: null, bron: SCHATTING_LABEL, datum: GENOTEERD, opmerking: "Ongeveer; de werkelijke grondslag bepaalt de accountant." },
  { id: "delaware-registered-agent", naam: "Delaware registered agent", soort: "schatting", bedragCent: 10_000, munt: "USD", per: "jaar", btwPct: null, bron: SCHATTING_LABEL, datum: GENOTEERD, opmerking: "Ongeveer; de werkelijke prijs staat op de factuur." },
];

// --- rekenen -----------------------------------------------------------------

/** Het bedrag in euro-centen, of null bij een onbekend bedrag. Dollars worden omgerekend met de aanname USD_NAAR_EUR. */
export function euroCent(post: Pick<KostenPost, "bedragCent" | "munt">): number | null {
  if (post.bedragCent === null) return null;
  return post.munt === "USD" ? Math.round(post.bedragCent * USD_NAAR_EUR) : post.bedragCent;
}

/** Per maand (jaarbedragen gedeeld door 12); null bij een onbekend bedrag of een eenmalige post. */
export function perMaandCent(post: KostenPost): number | null {
  const e = euroCent(post);
  if (e === null || post.per === "eenmalig") return null;
  return post.per === "maand" ? e : Math.round(e / 12);
}

/** Per jaar (maandbedragen maal 12); null bij een onbekend bedrag of een eenmalige post. */
export function perJaarCent(post: KostenPost): number | null {
  const e = euroCent(post);
  if (e === null || post.per === "eenmalig") return null;
  return post.per === "jaar" ? e : e * 12;
}

const metBtw = (excl: number, pct: number | null) => (pct === null ? excl : Math.round(excl * (1 + pct / 100)));

export interface Totalen {
  maandExclCent: number;
  maandInclCent: number;
  jaarExclCent: number;
  jaarInclCent: number;
  /** posten die in het totaal zitten */
  geteld: number;
  /** posten zonder bedrag: staan in de lijst, tellen niet mee */
  onbekend: number;
  /** eenmalige posten: staan in de lijst, tellen niet mee in maand en jaar */
  eenmalig: number;
  /** posten in het totaal die in dollars zijn opgegeven en omgerekend (aanname) */
  omgerekend: number;
  /** posten in het totaal waarvan het btw-percentage niet bekend is: bij "incl. btw" komt er niets bij */
  zonderBtw: number;
}

/** Het totaal van een stel posten. Geef nooit schattingen en opgaven door elkaar mee: gebruik splits() eerst. */
export function totalen(posten: KostenPost[]): Totalen {
  const t: Totalen = { maandExclCent: 0, maandInclCent: 0, jaarExclCent: 0, jaarInclCent: 0, geteld: 0, onbekend: 0, eenmalig: 0, omgerekend: 0, zonderBtw: 0 };
  for (const p of posten) {
    if (p.bedragCent === null) {
      t.onbekend += 1;
      continue;
    }
    if (p.per === "eenmalig") {
      t.eenmalig += 1;
      continue;
    }
    const m = perMaandCent(p);
    const j = perJaarCent(p);
    if (m === null || j === null) continue;
    t.geteld += 1;
    t.maandExclCent += m;
    t.jaarExclCent += j;
    t.maandInclCent += metBtw(m, p.btwPct);
    t.jaarInclCent += metBtw(j, p.btwPct);
    if (p.munt === "USD") t.omgerekend += 1;
    if (p.btwPct === null) t.zonderBtw += 1;
  }
  return t;
}

/** Vaststaand (opgave van een mens) en geschat strikt uit elkaar. */
export function splits(posten: KostenPost[]): { vaststaand: KostenPost[]; geschat: KostenPost[] } {
  return { vaststaand: posten.filter((p) => p.soort === "handmatig"), geschat: posten.filter((p) => p.soort === "schatting") };
}

// --- tonen --------------------------------------------------------------------

const eur = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
const usd = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "USD" });

export const formatEuro = (cent: number) => eur.format(cent / 100);

/** "€ 200,00", "$ 7,70 (omgerekend € 7,08, aanname 1 USD = 0,92 EUR)" of "bedrag onbekend". */
export function bedragTekst(post: Pick<KostenPost, "bedragCent" | "munt">): string {
  if (post.bedragCent === null) return "bedrag onbekend";
  if (post.munt === "EUR") return formatEuro(post.bedragCent);
  const omgerekend = euroCent(post) ?? 0;
  return `${usd.format(post.bedragCent / 100)} (omgerekend ${formatEuro(omgerekend)}, aanname 1 USD = ${String(USD_NAAR_EUR).replace(".", ",")} EUR)`;
}

export const PER_LABEL: Record<Per, string> = { maand: "per maand", jaar: "per jaar", eenmalig: "eenmalig" };

/** "13 nov" voor een ISO-datum (JJJJ-MM-DD); null of een rare waarde geeft "datum onbekend". */
export function datumKort(datum: string | null): string {
  const m = datum === null ? null : /^(\d{4})-(\d{2})-(\d{2})$/.exec(datum);
  if (!m) return "datum onbekend";
  // het middaguur UTC: in Amsterdam altijd dezelfde dag
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short", timeZone: "Europe/Amsterdam" }).replace(".", "");
}

/** De bron met datum zoals hij bij elke post staat: "opgave eigenaar, 13 nov". */
export function bronRegel(post: Pick<KostenPost, "bron" | "datum">): string {
  return `${post.bron}, ${datumKort(post.datum)}`;
}

// --- wijzigen (de server geeft de nieuwe stand terug) ---------------------------

export type KostenWijziging = { upsert: KostenPost } | { verwijder: string };

/** Past een wijziging toe op een stand en geeft de nieuwe stand met een hogere versie. */
export function pasToe(stand: KostenStand, wijziging: KostenWijziging, nu: Date): KostenStand {
  const posten =
    "verwijder" in wijziging
      ? stand.posten.filter((p) => p.id !== wijziging.verwijder)
      : stand.posten.some((p) => p.id === wijziging.upsert.id)
        ? stand.posten.map((p) => (p.id === wijziging.upsert.id ? wijziging.upsert : p))
        : [...stand.posten, wijziging.upsert];
  return { posten, versie: stand.versie + 1, bijgewerktOp: nu.toISOString() };
}

/** Een nette sleutel voor een nieuwe post uit zijn naam: kleine letters, cijfers en streepjes. */
export function postId(naam: string, bestaand: string[]): string {
  const basis = naam.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "post";
  if (!bestaand.includes(basis)) return basis;
  for (let i = 2; i < 1000; i++) if (!bestaand.includes(`${basis}-${i}`)) return `${basis}-${i}`;
  return `${basis}-${bestaand.length + 1}`;
}

// --- gemeten facturen (uit de TransIP-API) ---------------------------------------

/** Wat de pagina van de TransIP-facturen krijgt: de gemeten gegevens, of een nette melding bij een storing. */
export type TransipFacturen =
  | { ok: true; facturen: GemetenFactuur[]; perMaand: MaandTotaal[]; gelezenOp: string }
  | { ok: false; melding: string };

export interface GemetenFactuur {
  nummer: string;
  /** JJJJ-MM-DD */
  datum: string;
  status: string;
  exclCent: number;
  inclCent: number;
}

export interface MaandTotaal {
  maand: string;
  exclCent: number;
  inclCent: number;
  aantal: number;
}

/** De gemeten facturen per maand (op de factuurdatum), nieuwste eerst. */
export function facturenPerMaand(facturen: GemetenFactuur[]): MaandTotaal[] {
  const per = new Map<string, MaandTotaal>();
  for (const f of facturen) {
    const maand = f.datum.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(maand)) continue;
    const m = per.get(maand) ?? { maand, exclCent: 0, inclCent: 0, aantal: 0 };
    m.exclCent += f.exclCent;
    m.inclCent += f.inclCent;
    m.aantal += 1;
    per.set(maand, m);
  }
  return [...per.values()].sort((a, b) => (a.maand < b.maand ? 1 : -1));
}
