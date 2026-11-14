import { kvGet, kvSet } from "@/lib/storage/kv";

// ---------------------------------------------------------------------------
// Sessies intrekken (14 nov 2026). Een sessie is een ondertekende JWT die tot 30 dagen geldt ("ingelogd blijven");
// zonder dit bleef een gestolen sessie gewoon werken nadat de eigenaar zijn wachtwoord had hersteld. Nu bewaart het
// herstellen per gebruiker het moment "sessies van vóór dit moment zijn ongeldig" (KV, zonder databasewijziging), en
// vergelijkt elke sessiecontrole de uitgifte-tijd (iat) van het token daarmee. Nieuwe aanmeldingen na het herstellen
// hebben een latere iat en blijven werken.
// Een storing in KV mag niemand buitensluiten: dan telt de sessie als geldig (fail-open, zoals bij de inlogslot).
// ---------------------------------------------------------------------------

/** KV-sleutel per gebruiker; staat in ERASABLE_KV_PREFIXES (lib/privacy/user-kv.ts) voor export en wissen. */
export const SESSIE_VANAF_PREFIX = "sessie-vanaf:";

/** Puur: is een token (uitgegeven op `uitgegevenOp`, in seconden) ingetrokken door een moment `vanaf` (seconden)? */
export function sessieIngetrokken(uitgegevenOp: number | undefined, vanaf: number | null): boolean {
  if (vanaf === null || !Number.isFinite(vanaf)) return false;
  // een token zonder uitgifte-tijd kan niet bewijzen dat het van na het herstellen is
  return typeof uitgegevenOp !== "number" || uitgegevenOp < vanaf;
}

/** Alle sessies van deze gebruiker die nu bestaan, zijn vanaf nu ongeldig. */
export async function trekSessiesIn(userId: string, nu: number = Date.now()): Promise<void> {
  await kvSet(`${SESSIE_VANAF_PREFIX}${userId}`, Math.floor(nu / 1000));
}

/** Geldt deze sessie nog? Bij een KV-storing: ja. */
export async function sessieNogGeldig(userId: string, uitgegevenOp: number | undefined): Promise<boolean> {
  try {
    const vanaf = await kvGet<number>(`${SESSIE_VANAF_PREFIX}${userId}`);
    return !sessieIngetrokken(uitgegevenOp, typeof vanaf === "number" ? vanaf : null);
  } catch {
    return true;
  }
}
