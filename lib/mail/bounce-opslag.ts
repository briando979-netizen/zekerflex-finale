import { createHash } from "node:crypto";
import { kvDelete, kvDeleteStale, kvGet, kvListEntries, kvSet } from "@/lib/storage/kv";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Opslag van terugkaatsers per adres (lib/mail/bounce.ts). De sleutel is een hash van het adres, nooit het adres zelf:
//   mail-bounce:<hash>        — harde terugkaatser: sendMail stuurt daar geen outreach, nieuwsbrief of herinnering meer heen
//   mail-bounce-zacht:<hash>  — zachte terugkaatsers geteld; drie binnen 7 dagen = hard
// Bewaartermijn 365 dagen (de ronde ruimt ouder op). Bij het wissen van een account gaan beide mee via het oude adres
// (lib/privacy/anonymize.ts), zoals nfc-fob:<hash>: een voorvoegsel op user-id zou deze sleutels nooit vinden.
// Alles faalt open: een storing in de KV mag nooit een mail tegenhouden.
// ---------------------------------------------------------------------------

export const BOUNCE_BEWAAR_DAGEN = 365;
export const ZACHT_VENSTER_DAGEN = 7;
export const ZACHT_WORDT_HARD = 3;
const DAG = 86_400_000;

const hashVan = (email: string) => createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 32);
export const bounceSleutel = (email: string) => `mail-bounce:${hashVan(email)}`;
export const zachtSleutel = (email: string) => `mail-bounce-zacht:${hashVan(email)}`;

interface HardeBounce {
  at: string;
  code: string;
}
interface ZachteBounces {
  n: number;
  eerste: string;
  laatst: string;
  code: string;
}

/** Kaatst dit adres hard terug (binnen de bewaartermijn)? Bij een storing: nee (fail-open). */
export async function heeftHardeBounce(email: string, nu = Date.now()): Promise<boolean> {
  try {
    const b = await kvGet<HardeBounce>(bounceSleutel(email));
    return Boolean(b && nu - Date.parse(b.at) < BOUNCE_BEWAAR_DAGEN * DAG);
  } catch (err) {
    logger.warn("bounce: opzoeken mislukt (mail gaat door)", { error: (err as Error).message.slice(0, 120) });
    return false;
  }
}

export async function markeerHard(email: string, code: string, nu = new Date()): Promise<void> {
  await kvSet(bounceSleutel(email), { at: nu.toISOString(), code } satisfies HardeBounce);
  await kvDelete(zachtSleutel(email)).catch(() => undefined);
}

/** Tel een zachte terugkaatser; geeft true als het adres daarmee als hard telt (en markeert het dan). */
export async function telZacht(email: string, code: string, nu = new Date()): Promise<boolean> {
  const oud = await kvGet<ZachteBounces>(zachtSleutel(email)).catch(() => null);
  const binnen = oud && nu.getTime() - Date.parse(oud.eerste) < ZACHT_VENSTER_DAGEN * DAG;
  const n = binnen ? oud.n + 1 : 1;
  if (n >= ZACHT_WORDT_HARD) {
    await markeerHard(email, code, nu);
    return true;
  }
  await kvSet(zachtSleutel(email), { n, eerste: binnen ? oud.eerste : nu.toISOString(), laatst: nu.toISOString(), code } satisfies ZachteBounces);
  return false;
}

/** Ruim markeringen op die ouder zijn dan de bewaartermijn (ook de berichtmerken van de ronde). Geeft het aantal gewiste. */
export async function ruimBouncesOp(nu = Date.now()): Promise<number> {
  const voor = (dagen: number) => new Date(nu - dagen * DAG);
  const tellen = await Promise.all([
    kvDeleteStale("mail-bounce:", voor(BOUNCE_BEWAAR_DAGEN)),
    kvDeleteStale("mail-bounce-zacht:", voor(ZACHT_VENSTER_DAGEN * 2)),
    kvDeleteStale(BERICHT_MERK_PREFIX, voor(BERICHT_MERK_DAGEN)),
  ]).catch(() => [0]);
  return tellen.reduce((a, b) => a + b, 0);
}

// Per gelezen terugkaatser in de postbus een merk (het IMAP-berichtnummer, geen persoon), zodat de ronde hem niet elk uur
// opnieuw ophaalt. Alleen de indeling, nooit het adres. Ouder dan 60 dagen weg; de ronde kijkt alleen naar 30 dagen terug.
export const BERICHT_MERK_PREFIX = "bounce:seen:";
export const BERICHT_MERK_DAGEN = 60;
export interface BerichtMerk {
  at: string;
  /** de indeling per ontvanger, zonder adres */
  soorten: { soort: "hard" | "beleid" | "zacht"; code: string; aanbieder: string }[];
  /** true = de stappen (onderdrukken, lead, mail-log) zijn gedaan; false = alleen gelezen met de vlag uit */
  verwerkt: boolean;
}
export const berichtMerkSleutel = (berichtUid: number) => `${BERICHT_MERK_PREFIX}${berichtUid}`;
export async function leesBerichtMerk(berichtUid: number): Promise<BerichtMerk | null> {
  return kvGet<BerichtMerk>(berichtMerkSleutel(berichtUid)).catch(() => null);
}
export async function zetBerichtMerk(berichtUid: number, merk: BerichtMerk): Promise<void> {
  await kvSet(berichtMerkSleutel(berichtUid), merk).catch(() => undefined);
}
export async function berichtMerken(): Promise<BerichtMerk[]> {
  return (await kvListEntries<BerichtMerk>(BERICHT_MERK_PREFIX, 2000).catch(() => [])).map((r) => r.value).filter(Boolean);
}
