// ---------------------------------------------------------------------------
// Bank-koppeling: de toestemming per bankrekening bewaren in KV (geen migratie nodig). Het sessie-id van de aanbieder is
// een toegangsmiddel en staat daarom versleuteld (sealSecret, sleutel afgeleid van AUTH_SECRET); er staat geen IBAN,
// naam of transactie in. De waarden horen bij de administratie van het platform, niet bij één gebruiker: dus geen
// voorvoegsel in ERASABLE_KV_PREFIXES nodig.
// ---------------------------------------------------------------------------

import { randomBytes } from "node:crypto";
import { kvDelete, kvGet, kvListEntries, kvSet } from "@/lib/storage/kv";
import { openSecret, sealSecret } from "@/lib/security/sealed-secret";
import { dagenTotVerlopen, leesStaat, toestemmingStand, type KoppelingStaat } from "./kern";

const STAAT = "boekhouding:bankkoppeling:staat:";
const STATE = "boekhouding:bankkoppeling:state:";
const DOEL = "bankkoppeling-sessie";
/** Hoe lang de eigenaar heeft om bij de bank toestemming te geven (CSRF-token). */
export const STATE_GELDIG_MS = 20 * 60_000;

export const verzegelSessie = (sessieId: string): string => sealSecret(sessieId, DOEL);
export const openSessie = (verzegeld: string): string => openSecret(verzegeld, DOEL);

export async function leesKoppelingStaat(bankRekeningId: string): Promise<KoppelingStaat | null> {
  return leesStaat(await kvGet<unknown>(`${STAAT}${bankRekeningId}`));
}

export async function bewaarKoppelingStaat(bankRekeningId: string, staat: KoppelingStaat): Promise<void> {
  await kvSet(`${STAAT}${bankRekeningId}`, staat);
}

export async function wisKoppelingStaat(bankRekeningId: string): Promise<void> {
  await kvDelete(`${STAAT}${bankRekeningId}`);
}

export async function alleKoppelingStaten(): Promise<{ bankRekeningId: string; staat: KoppelingStaat }[]> {
  const rijen = await kvListEntries<unknown>(STAAT, 200);
  return rijen.flatMap((r) => {
    const staat = leesStaat(r.value);
    return staat ? [{ bankRekeningId: r.key.slice(STAAT.length), staat }] : [];
  });
}

/** Voor Admin, Te doen: een regel per gekoppelde rekening waarvan de toestemming bijna verloopt of verlopen is (leeg = alles in orde). */
export async function bankToestemmingTeVernieuwen(nu: Date = new Date()): Promise<string[]> {
  const regels: string[] = [];
  for (const { staat } of await alleKoppelingStaten()) {
    const stand = toestemmingStand(staat.geldigTot, nu);
    if (stand === "verlopen") regels.push("de toestemming bij de bank is verlopen: er komen geen transacties meer binnen");
    else if (stand === "bijna-verlopen") regels.push(`de toestemming bij de bank verloopt over ${Math.max(dagenTotVerlopen(staat.geldigTot, nu), 0)} dagen`);
  }
  return regels;
}

export interface WachtendeToestemming {
  bankRekeningId: string;
  bank: string;
  door: string;
  op: string;
}

/** Een eenmalig token dat met de redirect van de bank terugkomt; alleen te gebruiken door wie het startte. */
export async function maakStateToken(w: Omit<WachtendeToestemming, "op">, nu: Date): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  await kvSet(`${STATE}${token}`, { ...w, op: nu.toISOString() } satisfies WachtendeToestemming);
  return token;
}

/** Haalt het token op en gooit het weg (eenmalig). Null bij onbekend, al gebruikt of verlopen. */
export async function neemStateToken(token: string, nu: Date): Promise<WachtendeToestemming | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const w = await kvGet<WachtendeToestemming>(`${STATE}${token}`);
  await kvDelete(`${STATE}${token}`);
  if (!w || typeof w.bankRekeningId !== "string" || typeof w.bank !== "string" || typeof w.door !== "string") return null;
  const op = Date.parse(w.op);
  if (!Number.isFinite(op) || nu.getTime() - op > STATE_GELDIG_MS) return null;
  return w;
}
