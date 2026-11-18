import { createHash } from "node:crypto";
import { kvDeleteStale, kvGet, kvSet } from "@/lib/storage/kv";
import { ANTWOORD_VENSTER_DAGEN, KV_INFO_STAND, type InfoMerk, type InfoStand } from "@/lib/mail/info-ronde";

// ---------------------------------------------------------------------------
// Opslag van de info-ronde (lib/mail/info-ronde.ts):
//   info-mail-antwoord:<hash>  — dit adres kreeg het eerste antwoord; de sleutel is een hash, nooit het adres zelf.
//                                Na 30 dagen weg. Bij het wissen van een account gaat hij mee via het oude adres
//                                (lib/privacy/anonymize.ts), zoals mail-bounce:<hash>: een voorvoegsel op user-id
//                                zou deze sleutel nooit vinden.
//   info-mail:gezien:<uid>     — het IMAP-berichtnummer (geen persoon) dat al bekeken is, met de soort. Na 14 dagen weg.
//   info-mail:uur              — hoeveel antwoorden er dit uur verstuurd zijn
//   meting:info-mail           — de laatste stand met de laatste 20 beslissingen (adressen gemaskeerd)
// ---------------------------------------------------------------------------

const DAG = 86_400_000;
export const INFO_ANTWOORD_PREFIX = "info-mail-antwoord:";
export const INFO_GEZIEN_PREFIX = "info-mail:gezien:";
export const INFO_GEZIEN_DAGEN = 14;
const KV_UUR = "info-mail:uur";

const hashVan = (email: string) => createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 32);
export const infoAntwoordSleutel = (email: string) => `${INFO_ANTWOORD_PREFIX}${hashVan(email)}`;

/** Kreeg dit adres in de laatste 30 dagen al een antwoord? Bij een storing: ja (dan liever geen antwoord dan twee). */
export async function kreegAlAntwoord(email: string, nu = Date.now()): Promise<boolean> {
  try {
    const r = await kvGet<{ at: string }>(infoAntwoordSleutel(email));
    return Boolean(r && nu - Date.parse(r.at) < ANTWOORD_VENSTER_DAGEN * DAG);
  } catch {
    return true;
  }
}

export async function onthoudAntwoord(email: string, nu = new Date()): Promise<void> {
  await kvSet(infoAntwoordSleutel(email), { at: nu.toISOString() });
}

const uurVan = (nu: Date) => nu.toISOString().slice(0, 13);

/** Het aantal antwoorden in dit (UTC-)uur. */
export async function antwoordenDitUur(nu = new Date()): Promise<number> {
  const r = await kvGet<{ uur: string; n: number }>(KV_UUR);
  return r && r.uur === uurVan(nu) ? r.n : 0;
}

export async function telAntwoord(nu = new Date()): Promise<void> {
  await kvSet(KV_UUR, { uur: uurVan(nu), n: (await antwoordenDitUur(nu).catch(() => 0)) + 1 });
}

export const leesInfoMerk = (uid: number) => kvGet<InfoMerk>(`${INFO_GEZIEN_PREFIX}${uid}`).catch(() => null);
export const zetInfoMerk = (uid: number, merk: InfoMerk) => kvSet(`${INFO_GEZIEN_PREFIX}${uid}`, merk);

export const leesInfoStand = () => kvGet<InfoStand>(KV_INFO_STAND).catch(() => null);
export const bewaarInfoStand = (stand: InfoStand) => kvSet(KV_INFO_STAND, stand);

export async function ruimInfoOp(nu = Date.now()): Promise<void> {
  await Promise.all([kvDeleteStale(INFO_ANTWOORD_PREFIX, new Date(nu - ANTWOORD_VENSTER_DAGEN * DAG)), kvDeleteStale(INFO_GEZIEN_PREFIX, new Date(nu - INFO_GEZIEN_DAGEN * DAG))]).catch(() => undefined);
}
