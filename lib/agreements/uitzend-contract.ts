import { randomUUID } from "node:crypto";
import { getFiscal } from "@/lib/fiscal/store";
import { getUitzendStatus } from "@/lib/payroll/uitzend-status";
import { kvAppend, kvGet } from "@/lib/storage/kv";
import { amsterdamParts } from "@/lib/time/amsterdam";
import { werkgeverGegevens } from "@/lib/platform/werkgever";

// ---------------------------------------------------------------------------
// Uitzendovereenkomst — the temp-work employment contract between ZekerFlex
// (formeel werkgever) and the uitzendkracht. Signed once during onboarding by
// tapping "Ondertekenen"; valid 3 kalendermaanden, then a fresh one is signed
// to keep working. Electronically signed (no wet signature), like the
// modelovereenkomst. Postgres-backed (KeyValueStore, key
// "uitzend-contracts:<userId>", array value) — was local disk, unreliable on
// Vercel's serverless functions.
// ---------------------------------------------------------------------------

export const CONTRACT_MONTHS = 3;

/**
 * De versie van de tekst (sjabloon) waarmee een overeenkomst wordt opgemaakt en getekend. Een getekende overeenkomst blijft voor altijd
 * in de versie waarin hij is getekend: dezelfde tekst, pdf en referentie. v1 (tot 12 nov 2026) had vaste bedrijfsgegevens (een
 * verzonnen KvK-nummer en "kantoorhoudende te Amsterdam"); v2 neemt de gegevens van de werkgever uit één bron (lib/platform/werkgever.ts)
 * en laat weg wat niet is ingesteld. Alleen de huidige versie telt als geldig: wie alleen een v1 heeft, tekent opnieuw.
 */
export const SJABLOON_HUIDIG = 2;

export interface UitzendContract {
  id: string;
  reference: string;
  userId: string;
  workerName: string;
  workerBsnLast4: string | null;
  employerName: string;
  /** v1: "00000000" zoals getekend; v2: het echte KvK-nummer, of "" als er geen is (Zekerflex, Inc. heeft er geen) */
  employerKvk: string;
  /** v2: het adres van de werkgever zoals ingesteld; ontbreekt als het niet is ingesteld (en bij v1) */
  employerAddress?: string;
  /** de sjabloonversie; ontbreekt bij v1 (de overeenkomsten van vóór 12 nov 2026) */
  sjabloon?: number;
  signedAt: string;
  validFrom: string;
  validUntil: string;
  /** ABU phase at signing */
  phase: "A" | "B" | "C";
  weeksWorked: number;
}

const key = (userId: string) => `uitzend-contracts:${userId}`;
export const CONTRACTEN_PREFIX = "uitzend-contracts:";

export const sjabloonVan = (c: Pick<UitzendContract, "sjabloon">): number => c.sjabloon ?? 1;

/** De werkgeversgegevens voor een nieuwe overeenkomst (v2): wat niet is ingesteld blijft leeg en valt in de tekst weg. */
function werkgeverVoorContract(): Pick<UitzendContract, "employerName" | "employerKvk" | "employerAddress"> {
  const w = werkgeverGegevens();
  return { employerName: w.naam, employerKvk: w.kvk ?? "", ...(w.adres ? { employerAddress: w.adres } : {}) };
}

const nogGeldig = (c: Pick<UitzendContract, "validUntil">, nu: number) => new Date(c.validUntil).getTime() > nu;

function addMonths(d: Date, m: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + m);
  return x;
}

export async function listUitzendContracts(userId: string): Promise<UitzendContract[]> {
  const rows = (await kvGet<UitzendContract[]>(key(userId))) ?? [];
  return [...rows].sort((a, b) => (a.signedAt < b.signedAt ? 1 : -1));
}

/**
 * The most recent contract that is still within its validity window AND in the current text version. Een overeenkomst in een
 * oudere versie telt niet meer: de werker leest en tekent de nieuwe (zie verouderdUitzendContract).
 */
export async function activeUitzendContract(userId: string): Promise<UitzendContract | null> {
  const now = Date.now();
  const all = await listUitzendContracts(userId);
  return all.find((c) => nogGeldig(c, now) && sjabloonVan(c) === SJABLOON_HUIDIG) ?? null;
}

/** Een nog niet verlopen overeenkomst in een oudere versie, terwijl er geen geldige huidige is: dan moet de werker opnieuw tekenen. */
export async function verouderdUitzendContract(userId: string, nu: number = Date.now()): Promise<UitzendContract | null> {
  const all = await listUitzendContracts(userId);
  if (all.some((c) => nogGeldig(c, nu) && sjabloonVan(c) === SJABLOON_HUIDIG)) return null;
  return all.find((c) => nogGeldig(c, nu) && sjabloonVan(c) < SJABLOON_HUIDIG) ?? null;
}

/**
 * Sign a new uitzendovereenkomst for this worker (or return the still-valid
 * one). Electronic signature = the moment of this call.
 */
export async function signUitzendContract(
  userId: string,
  workerName: string,
): Promise<{ contract: UitzendContract; created: boolean }> {
  const existing = await activeUitzendContract(userId);
  if (existing) return { contract: existing, created: false };

  const [fiscal, status] = await Promise.all([getFiscal(userId), getUitzendStatus(userId)]);
  const now = new Date();
  const year = amsterdamParts(now).year; // Dutch year: just after midnight on 1 Jan the UTC server is still in the old year
  const all = await listUitzendContracts(userId);
  const reference = `ZF-UZO-${year}-${String(all.length + 1).padStart(3, "0")}-${userId.replace(/[^a-z0-9]/gi, "").slice(0, 6)}`;

  const contract: UitzendContract = {
    id: randomUUID().slice(0, 12),
    reference,
    userId,
    workerName,
    workerBsnLast4: fiscal.bsnLast4,
    ...werkgeverVoorContract(),
    sjabloon: SJABLOON_HUIDIG,
    signedAt: now.toISOString(),
    validFrom: now.toISOString(),
    validUntil: addMonths(now, CONTRACT_MONTHS).toISOString(),
    phase: status?.phase ?? "A",
    weeksWorked: status?.weeksWorked ?? 0,
  };

  await kvAppend(key(userId), contract);
  return { contract, created: true };
}

/**
 * De overeenkomst zoals hij nu zou worden getekend, om te lezen VÓÓR het tekenen: niets wordt bewaard. Zelfde gegevens
 * als signUitzendContract (fase en gewerkte weken van nu, drie maanden vanaf nu), met de referentie "VOORBEELD".
 */
export async function voorbeeldUitzendContract(userId: string, workerName: string, now: Date = new Date()): Promise<UitzendContract> {
  const [fiscal, status] = await Promise.all([getFiscal(userId), getUitzendStatus(userId)]);
  return {
    id: "voorbeeld",
    reference: "VOORBEELD",
    userId,
    workerName,
    workerBsnLast4: fiscal.bsnLast4,
    ...werkgeverVoorContract(),
    sjabloon: SJABLOON_HUIDIG,
    signedAt: now.toISOString(),
    validFrom: now.toISOString(),
    validUntil: addMonths(now, CONTRACT_MONTHS).toISOString(),
    phase: status?.phase ?? "A",
    weeksWorked: status?.weeksWorked ?? 0,
  };
}
