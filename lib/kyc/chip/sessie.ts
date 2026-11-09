// ---------------------------------------------------------------------------
// Chip lezen met de telefoon, de koppeling tussen website, app en server:
//   1. de ID-scan leest de MRZ (POST /api/onboarding/document-lezen). Alleen in
//      een app die de chip kan lezen (cookie zf_app_chip) bewaren we een goede
//      lezing als sleutel om de chip te openen (BAC/PACE): nummer, geboortedatum,
//      vervaldatum. Op de website wordt niets bewaard.
//   2. de website vraagt een eenmalige code (POST /api/onboarding/chip/start)
//      en opent daarmee de app (ChipActivity). Geen MRZ-gegevens in een adres.
//   3. de app haalt met die code de sleutel op (POST /api/chip/sleutel), leest
//      de chip en stuurt DG1, DG2 en het SOD terug (POST /api/chip/klaar).
//   4. de server controleert alles (lib/kyc/chip/chip.ts) en bewaart alleen de
//      uitslag, 60 minuten; de verificatie (lib/onboarding/verify.ts) neemt die mee.
// Nooit bewaard: de pasfoto (DG2), het BSN, de ruwe chipbestanden.
// Alles wat wel even blijft staan, is verzegeld (AES-256-GCM, lib/security/
// sealed-secret.ts): een gelekte database of back-up toont niets. KV kent geen
// verlooptijd, dus ruimChipOp() wist het echt: elke 15 minuten via de cron
// (/api/internal/kyc/chip-opruimen) en bij elke nieuwe chipstart; na een
// verificatie wist wisChipGegevens() alles van die persoon.
// Sleutels met het userId erin (AVG: ERASABLE_KV_PREFIXES in lib/privacy/user-kv.ts).
// ---------------------------------------------------------------------------

import { randomBytes } from "node:crypto";
import type { X509Certificate } from "node:crypto";
import { kvDelete, kvDeleteStale, kvGet, kvListKeys, kvSet } from "@/lib/storage/kv";
import { openSecret, sealSecret } from "@/lib/security/sealed-secret";
import { controleerChip } from "@/lib/kyc/chip/chip";
import { naamVoluit, zelfdeNummer, type MrzUitslag } from "@/lib/kyc/mrz";

export const MRZ_PREFIX = "mrz-lezing:";
export const SESSIE_PREFIX = "chip-sessie:";
export const LEZING_PREFIX = "chip-lezing:";

const MRZ_MS = 30 * 60_000;
const SESSIE_MS = 10 * 60_000;
const LEZING_MS = 60 * 60_000;
const MAX_SLEUTEL = 5;

interface MrzVoorChip {
  nummer: string;
  geboren: string; // yyyy-mm-dd
  verval: string; // yyyy-mm-dd
  op: string;
}

interface Sessie extends Omit<MrzVoorChip, "op"> {
  userId: string;
  verloopt: string;
  gebruikt: number;
}

/** Wat er van een chiplezing bewaard blijft: alleen de uitslag. */
export interface ChipLezing {
  op: string;
  echt: boolean;
  hashesOk: boolean;
  handtekeningOk: boolean;
  ketenOk: boolean | null;
  geldigOk: boolean;
  land: string | null;
  /** het nummer op de chip is hetzelfde als op het gescande document */
  nummerKlopt: boolean;
  /** de naam zoals op de chip (de verificatie vergelijkt hem met het account) */
  naamOpChip: string | null;
  documentnummer: string | null;
  vervaldatum: string | null;
  fouten: string[];
}

const vers = (op: string, ms: number, nu: Date) => nu.getTime() - new Date(op).getTime() < ms;

// ---- verzegeld bewaren (AES-256-GCM met een sleutel uit AUTH_SECRET, eigen doel) ----
const DOEL = "kyc-chip";
async function bewaar(sleutel: string, waarde: unknown): Promise<void> {
  await kvSet(sleutel, { v: sealSecret(JSON.stringify(waarde), DOEL) });
}
async function lees<T>(sleutel: string): Promise<T | null> {
  const rij = await kvGet<{ v?: unknown }>(sleutel);
  if (!rij || typeof rij.v !== "string") return null;
  try {
    return JSON.parse(openSecret(rij.v, DOEL)) as T;
  } catch {
    return null; // onleesbaar (oude sleutel, geknoeid): telt als niet bestaand
  }
}

/** Wist wat te oud is, echt (KV kent geen verlooptijd). Voor de cron en bij elke chipstart. */
export async function ruimChipOp(nu: Date = new Date()): Promise<number> {
  const voor = (ms: number) => new Date(nu.getTime() - ms);
  const aantallen = await Promise.all([
    kvDeleteStale(MRZ_PREFIX, voor(MRZ_MS)),
    kvDeleteStale(SESSIE_PREFIX, voor(SESSIE_MS)),
    kvDeleteStale(LEZING_PREFIX, voor(LEZING_MS)),
  ]);
  return aantallen.reduce((a, b) => a + b, 0);
}

/** yyyy-mm-dd → yymmdd, zoals de chip het als sleutel wil */
const kort = (iso: string) => iso.slice(2, 4) + iso.slice(5, 7) + iso.slice(8, 10);

/** Stap 1: een goed gelezen MRZ bewaren als sleutel voor de chip. */
export async function bewaarMrzVoorChip(userId: string, u: MrzUitslag, nu: Date = new Date()): Promise<void> {
  if (!u.geldig || !u.geboortedatum || !u.vervaldatum) return;
  const w: MrzVoorChip = { nummer: u.documentnummer, geboren: u.geboortedatum, verval: u.vervaldatum, op: nu.toISOString() };
  await bewaar(`${MRZ_PREFIX}${userId}`, w);
}

/** De code: userId + een geheim van 24 willekeurige bytes. */
function knip(code: string): { userId: string; geheim: string } | null {
  const m = /^([A-Za-z0-9_-]{1,64})\.([A-Za-z0-9_-]{32})$/.exec(code);
  return m ? { userId: m[1]!, geheim: m[2]! } : null;
}

/** Stap 2: een eenmalige code voor de app; null als er geen verse MRZ-lezing is. */
export async function startChipSessie(userId: string, nu: Date = new Date()): Promise<string | null> {
  void ruimChipOp(nu).catch(() => undefined);
  const mrz = await lees<MrzVoorChip>(`${MRZ_PREFIX}${userId}`);
  if (!mrz || !vers(mrz.op, MRZ_MS, nu)) return null;
  const geheim = randomBytes(24).toString("base64url");
  const sessie: Sessie = { userId, nummer: mrz.nummer, geboren: mrz.geboren, verval: mrz.verval, verloopt: new Date(nu.getTime() + SESSIE_MS).toISOString(), gebruikt: 0 };
  await bewaar(`${SESSIE_PREFIX}${userId}:${geheim}`, sessie);
  return `${userId}.${geheim}`;
}

async function sessieVan(code: string, nu: Date): Promise<{ sleutel: string; sessie: Sessie } | null> {
  const k = knip(code);
  if (!k) return null;
  const sleutel = `${SESSIE_PREFIX}${k.userId}:${k.geheim}`;
  const sessie = await lees<Sessie>(sleutel);
  if (!sessie || sessie.userId !== k.userId) return null;
  if (new Date(sessie.verloopt).getTime() < nu.getTime()) {
    await kvDelete(sleutel).catch(() => undefined);
    return null;
  }
  return { sleutel, sessie };
}

/** Stap 3a: de app haalt de sleutel voor de chip op (hooguit een paar keer: opnieuw tegen de telefoon houden mag). */
export async function chipSleutel(code: string, nu: Date = new Date()): Promise<{ documentnummer: string; geboortedatum: string; vervaldatum: string } | null> {
  const s = await sessieVan(code, nu);
  if (!s || s.sessie.gebruikt >= MAX_SLEUTEL) return null;
  await bewaar(s.sleutel, { ...s.sessie, gebruikt: s.sessie.gebruikt + 1 });
  return { documentnummer: s.sessie.nummer, geboortedatum: kort(s.sessie.geboren), vervaldatum: kort(s.sessie.verval) };
}

/** Stap 3b + 4: de chipbestanden controleren en alleen de uitslag bewaren. De code is daarna op. */
export async function rondChipAf(
  code: string,
  bestanden: { dg1: Buffer; dg2?: Buffer; sod: Buffer },
  csca: X509Certificate[],
  nu: Date = new Date(),
): Promise<ChipLezing | null> {
  const s = await sessieVan(code, nu);
  if (!s) return null;
  const u = controleerChip(bestanden, csca, nu);
  const lezing: ChipLezing = {
    op: nu.toISOString(),
    echt: u.echt,
    hashesOk: u.hashesOk,
    handtekeningOk: u.handtekeningOk,
    ketenOk: u.ketenOk,
    geldigOk: u.geldigOk,
    land: u.land,
    nummerKlopt: Boolean(u.mrz?.geldig && zelfdeNummer(u.mrz.documentnummer, s.sessie.nummer)),
    naamOpChip: u.mrz ? naamVoluit(u.mrz) : null,
    documentnummer: u.mrz?.geldig ? u.mrz.documentnummer : null,
    vervaldatum: u.mrz?.geldig ? u.mrz.vervaldatum : null,
    fouten: u.fouten,
  };
  await bewaar(`${LEZING_PREFIX}${s.sessie.userId}`, lezing);
  await kvDelete(s.sleutel).catch(() => undefined);
  return lezing;
}

/** De laatste chiplezing van iemand, als die vers is. */
export async function chipLezing(userId: string, nu: Date = new Date()): Promise<ChipLezing | null> {
  const l = await lees<ChipLezing>(`${LEZING_PREFIX}${userId}`);
  return l && vers(l.op, LEZING_MS, nu) ? l : null;
}

/** Na elke verificatie: de uitslag, de MRZ-sleutel en alle chipsessies van die persoon weg. */
export async function wisChipGegevens(userId: string): Promise<void> {
  const sessies = await kvListKeys(`${SESSIE_PREFIX}${userId}:`).catch(() => [] as string[]);
  await Promise.all([kvDelete(`${LEZING_PREFIX}${userId}`), kvDelete(`${MRZ_PREFIX}${userId}`), ...sessies.map((k) => kvDelete(k))]).catch(() => undefined);
}

/** Een korte, eerlijke tekst voor de app en het scherm. */
export function chipTekst(l: ChipLezing): string {
  if (l.echt && l.nummerKlopt) return "Je chip is gelezen en echt bevonden: de gegevens zijn door de overheid ondertekend.";
  if (l.echt && !l.nummerKlopt) return "De chip is echt, maar hoort bij een ander document dan je net hebt gescand.";
  if (!l.hashesOk && l.handtekeningOk) return "De gegevens op de chip wijken af van het zegel. Een medewerker kijkt mee.";
  if (l.ketenOk === null && l.handtekeningOk && l.hashesOk) return "Je chip is gelezen en het zegel klopt. De laatste controle (het certificaat van de overheid) doet een medewerker.";
  return "De chip kon niet als echt worden bevestigd. Een medewerker kijkt mee.";
}
