import { env } from "@/lib/env";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { KETTING_AANBIEDERS, KETTING_DIENSTEN, magViaKetting, type DienstId, type KettingDienst } from "@/lib/ai/ketting";
import { bijgewerkt, bruikbaar, type AanbiederStand, type Uitkomst } from "@/lib/ai/ketting-limiet";

// ---------------------------------------------------------------------------
// De gratis rij (lib/ai/ketting.ts) op de server: de sleutel, het accountnummer en aan/uit per dienst (KV, Admin → Alles
// gratis, zonder uitrol) en de stand per model (vol tot wanneer, vragen vandaag) in het geheugen van de app. Die stand
// staat op globalThis: Next bundelt routes apart, en het beheerscherm moet dezelfde stand zien als de AI-aanroepen.
// Na een herstart is de stand leeg; een model dat nog vol zit, zegt dat bij de eerste vraag meteen weer (429).
// ---------------------------------------------------------------------------

const KEY = "ai-node:ketting";
const TTL_MS = 60_000;

export interface KettingInstelling {
  /** sleutel per dienst; nooit terug naar het scherm, alleen óf er een staat */
  sleutels: Partial<Record<DienstId, string>>;
  /** accountnummer per dienst (Cloudflare); geen geheim, wel alleen in Beheer */
  accounts: Partial<Record<DienstId, string>>;
  /** diensten die de beheerder heeft uitgezet */
  uit: DienstId[];
}

interface Geheugen {
  instelling: { v: KettingInstelling; at: number };
  standen: Record<string, AanbiederStand>;
}

const leegInstelling = (): KettingInstelling => ({ sleutels: {}, accounts: {}, uit: [] });
const g = globalThis as typeof globalThis & { __zfKetting?: Geheugen };
function geheugen(): Geheugen {
  g.__zfKetting ??= { instelling: { v: leegInstelling(), at: 0 }, standen: {} };
  return g.__zfKetting;
}

const isDienst = (x: unknown): x is DienstId => typeof x === "string" && KETTING_DIENSTEN.some((d) => d.id === x);

function tekstPerDienst(raw: unknown): Partial<Record<DienstId, string>> {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const uit: Partial<Record<DienstId, string>> = {};
  for (const d of KETTING_DIENSTEN) {
    const v = r[d.id];
    if (typeof v === "string" && v.trim()) uit[d.id] = v.trim();
  }
  return uit;
}

function lees(raw: unknown): KettingInstelling {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    sleutels: tekstPerDienst(r.sleutels),
    accounts: tekstPerDienst(r.accounts),
    uit: Array.isArray(r.uit) ? r.uit.filter(isDienst) : [],
  };
}

/** Ververs de instelling uit KV (hooguit eens per minuut). Opslag even weg → de laatste waarde houden. */
export async function primeKetting(): Promise<void> {
  const m = geheugen();
  if (m.instelling.at > 0 && Date.now() - m.instelling.at < TTL_MS) return;
  try {
    m.instelling = { v: lees(await kvGet<unknown>(KEY)), at: Date.now() };
  } catch {
    m.instelling = { v: m.instelling.v, at: Date.now() };
  }
}

/** De sleutel van een dienst: uit Beheer (KV), anders uit de omgeving (Cloudflare: dezelfde als voor de AI-foto's). */
function sleutelVan(d: KettingDienst): { waarde: string; bron: "beheer" | "server" } | null {
  const kv = geheugen().instelling.v.sleutels[d.id];
  if (kv) return { waarde: kv, bron: "beheer" };
  if (d.id === "cloudflare" && env.CLOUDFLARE_AI_TOKEN) return { waarde: env.CLOUDFLARE_AI_TOKEN, bron: "server" };
  return null;
}

/** Het adres van een dienst; null als het accountnummer ontbreekt. */
function basisVan(d: KettingDienst): string | null {
  if (!d.accountNodig) return d.basis;
  const account = geheugen().instelling.v.accounts[d.id] ?? (d.id === "cloudflare" ? env.CLOUDFLARE_ACCOUNT_ID : undefined);
  return account ? d.basis.replace("{account}", encodeURIComponent(account)) : null;
}

export interface KettingDoel {
  /** het model in de rij (KETTING_AANBIEDERS) */
  id: string;
  dienst: DienstId;
  basis: string;
  sleutel: string;
  model: string;
  /** kan de dienst response_format json_object aan bij dit model? Zo niet, dan vragen we JSON alleen in de tekst */
  json: boolean;
  /** vaste extra velden voor dit model (bijv. weinig denkwerk) */
  extra: Record<string, unknown>;
  /** extra max_tokens voor het denkwerk van een denkend model */
  denkRuimte: number;
}

/**
 * De modellen die nu een vraag mogen krijgen, in volgorde (de beste eerst): met sleutel, dienst niet uitgezet, niet
 * vol, onder onze eigen grens per minuut en per dag, en met wat deze vraag nodig heeft (stroom). Leeg = ons eigen model.
 */
export function kettingDoelen(vraag: { purpose?: string | undefined; stream: boolean }, nu = Date.now()): KettingDoel[] {
  if (!env.AI_ALLOW_REMOTE || !magViaKetting(vraag.purpose)) return [];
  const m = geheugen();
  const uit = new Set(m.instelling.v.uit);
  const doelen: KettingDoel[] = [];
  for (const a of KETTING_AANBIEDERS) {
    const d = KETTING_DIENSTEN.find((x) => x.id === a.dienst);
    if (!d || uit.has(d.id)) continue;
    if (vraag.stream && !a.stream) continue;
    if (!bruikbaar(m.standen[a.id], a.limiet, nu)) continue;
    const sleutel = sleutelVan(d);
    const basis = basisVan(d);
    if (!sleutel || !basis) continue;
    doelen.push({ id: a.id, dienst: d.id, basis, sleutel: sleutel.waarde, model: a.model, json: a.json, extra: a.extra, denkRuimte: a.denkRuimte });
  }
  return doelen;
}

/** Er gaat een vraag heen: tel hem (vandaag en de laatste minuut). */
export function noteerPoging(id: string, nu = Date.now()): void {
  const m = geheugen();
  const s = bijgewerkt(m.standen[id], nu);
  m.standen[id] = { ...s, vandaag: s.vandaag + 1, minuut: [...s.minuut, nu] };
}

/** Er kwam een goed antwoord: het model is (weer) bruikbaar. */
export function noteerGelukt(id: string, ms: number, nu = Date.now()): void {
  const m = geheugen();
  const s = bijgewerkt(m.standen[id], nu);
  m.standen[id] = { ...s, gelukt: s.gelukt + 1, volTot: 0, reden: "", laatsteMs: ms };
}

/** Het ging mis: vol of storing → overslaan tot het opengaat; een fout in deze ene vraag laat het model staan. */
export function noteerMislukt(id: string, u: Uitkomst, nu = Date.now()): void {
  if (u.soort === "vraag") return;
  const m = geheugen();
  const s = bijgewerkt(m.standen[id], nu);
  m.standen[id] = { ...s, volTot: Math.max(s.volTot, u.tot), reden: u.reden };
}

export interface ModelOverzicht {
  id: string;
  model: string;
  /** tot wanneer overgeslagen (ISO), null = bruikbaar */
  volTot: string | null;
  reden: string;
  vandaag: number;
  gelukt: number;
  laatsteMs: number;
}

export interface DienstOverzicht {
  id: DienstId;
  naam: string;
  waar: string;
  aanmelden: string;
  limietTekst: string;
  opmerking: string;
  accountNodig: boolean;
  /** of het accountnummer bekend is (alleen bij accountNodig) */
  accountKlaar: boolean;
  /** sleutel (en zo nodig accountnummer) klaar */
  klaar: boolean;
  /** waar de sleutel staat: in Beheer of op de server (omgeving); null = nergens */
  sleutelBron: "beheer" | "server" | null;
  aan: boolean;
  modellen: ModelOverzicht[];
}

/** Voor het beheerscherm: per dienst de stand en per model of het vol zit, zonder sleutels. */
export async function kettingOverzicht(nu = Date.now()): Promise<DienstOverzicht[]> {
  await primeKetting();
  const m = geheugen();
  const uit = new Set(m.instelling.v.uit);
  return KETTING_DIENSTEN.map((d) => {
    const sleutel = sleutelVan(d);
    const accountKlaar = basisVan(d) !== null;
    return {
      id: d.id,
      naam: d.naam,
      waar: d.waar,
      aanmelden: d.aanmelden,
      limietTekst: d.limietTekst,
      opmerking: d.opmerking,
      accountNodig: d.accountNodig,
      accountKlaar,
      klaar: sleutel !== null && accountKlaar,
      sleutelBron: sleutel?.bron ?? null,
      aan: !uit.has(d.id),
      modellen: KETTING_AANBIEDERS.filter((a) => a.dienst === d.id).map((a) => {
        const s = bijgewerkt(m.standen[a.id], nu);
        return {
          id: a.id,
          model: a.model,
          volTot: s.volTot > nu ? new Date(s.volTot).toISOString() : null,
          reden: s.volTot > nu ? s.reden : "",
          vandaag: s.vandaag,
          gelukt: s.gelukt,
          laatsteMs: s.laatsteMs,
        };
      }),
    };
  });
}

export type KettingWijziging = {
  dienst: DienstId;
  sleutel?: string | undefined;
  account?: string | undefined;
  aan?: boolean | undefined;
};

/** Beheer: een sleutel of accountnummer bewaren of wissen (lege tekst), of een dienst aan/uit zetten. Zonder uitrol. */
export async function zetKetting(w: KettingWijziging): Promise<void> {
  if (!isDienst(w.dienst)) throw new Error("onbekende dienst");
  const m = geheugen();
  m.instelling.at = 0;
  await primeKetting();
  const v: KettingInstelling = { sleutels: { ...m.instelling.v.sleutels }, accounts: { ...m.instelling.v.accounts }, uit: [...m.instelling.v.uit] };
  const nieuweKans = () => {
    for (const a of KETTING_AANBIEDERS) if (a.dienst === w.dienst) delete m.standen[a.id];
  };
  if (w.sleutel !== undefined) {
    const s = w.sleutel.trim();
    if (s) v.sleutels[w.dienst] = s;
    else delete v.sleutels[w.dienst];
    nieuweKans();
  }
  if (w.account !== undefined) {
    const s = w.account.trim();
    if (s) v.accounts[w.dienst] = s;
    else delete v.accounts[w.dienst];
    nieuweKans();
  }
  if (w.aan !== undefined) v.uit = w.aan ? v.uit.filter((x) => x !== w.dienst) : [...new Set([...v.uit, w.dienst])];
  await kvSet(KEY, v);
  m.instelling = { v, at: Date.now() };
}

/** Alleen voor tests: de stand leegmaken; de instelling wordt bij de volgende vraag opnieuw uit KV gelezen. */
export function _resetKetting(): void {
  g.__zfKetting = { instelling: { v: leegInstelling(), at: 0 }, standen: {} };
}
