import { randomBytes } from "node:crypto";
import { redis } from "@/lib/redis";

// ---------------------------------------------------------------------------
// Challenges voor passkeys: willekeurig (32 bytes), alleen op de server
// bewaard (Redis), hooguit 5 minuten geldig en eenmalig. Ophalen = meteen
// wissen (GETDEL), dus ook een poging die daarna faalt verbruikt hem.
//
//   inloggen    — gebonden aan dit verzoek: een willekeurige id in een
//                 httpOnly-cookie wijst naar de challenge
//   registreren — gebonden aan de ingelogde gebruiker (één tegelijk)
//
// Valt Redis weg, dan gaat een passkey-inlog NOOIT door (fail-closed): zonder
// bewaarde challenge is er niets om tegen te controleren. Inloggen met het
// wachtwoord merkt daar niets van (lib/auth/login-throttle.ts faalt open).
// ---------------------------------------------------------------------------

export const UITDAGING_SECONDEN = 5 * 60;
/** Cookie met de id van de lopende inlogpoging (geen geheim: de challenge zelf staat in Redis). */
export const INLOG_COOKIE = "zf_passkey";

const inlogSleutel = (id: string) => `zf:passkey:inlog:${id}`;
const registratieSleutel = (userId: string) => `zf:passkey:registratie:${userId}`;

export const nieuweUitdaging = (): string => randomBytes(32).toString("base64url");
export const nieuweCeremonieId = (): string => randomBytes(24).toString("base64url");

const ID_VORM = /^[A-Za-z0-9_-]{32}$/;

export type Opgehaald<T> = { status: "ok"; waarde: T } | { status: "weg" } | { status: "storing" };

/** Bewaar de challenge van een inlogpoging. Gooit bij een storing (dan is er geen passkey-inlog). */
export async function bewaarInlogUitdaging(ceremonieId: string, challenge: string): Promise<void> {
  await redis.set(inlogSleutel(ceremonieId), challenge, "EX", UITDAGING_SECONDEN);
}

/** Haal de challenge van een inlogpoging op en wis hem in dezelfde stap. */
export async function pakInlogUitdaging(ceremonieId: string | null | undefined): Promise<Opgehaald<string>> {
  if (!ceremonieId || !ID_VORM.test(ceremonieId)) return { status: "weg" };
  try {
    const challenge = await redis.getdel(inlogSleutel(ceremonieId));
    return challenge ? { status: "ok", waarde: challenge } : { status: "weg" };
  } catch {
    return { status: "storing" };
  }
}

export interface RegistratieUitdaging {
  challenge: string;
  /** base64url user handle die we het toestel geven */
  userHandle: string;
}

/** Bewaar de challenge voor een nieuwe passkey van deze gebruiker (een nieuwe vervangt de vorige). */
export async function bewaarRegistratieUitdaging(userId: string, r: RegistratieUitdaging): Promise<void> {
  await redis.set(registratieSleutel(userId), JSON.stringify(r), "EX", UITDAGING_SECONDEN);
}

/** Wis een openstaande registratie-challenge (best effort: hij verloopt anders vanzelf na 5 minuten). */
export async function wisRegistratieUitdaging(userId: string): Promise<void> {
  try {
    await redis.del(registratieSleutel(userId));
  } catch {
    /* verloopt vanzelf */
  }
}

/** Haal de registratie-challenge van deze gebruiker op en wis hem in dezelfde stap. */
export async function pakRegistratieUitdaging(userId: string): Promise<Opgehaald<RegistratieUitdaging>> {
  let ruw: string | null;
  try {
    ruw = await redis.getdel(registratieSleutel(userId));
  } catch {
    return { status: "storing" };
  }
  if (!ruw) return { status: "weg" };
  try {
    const r = JSON.parse(ruw) as Partial<RegistratieUitdaging>;
    if (typeof r.challenge !== "string" || typeof r.userHandle !== "string") return { status: "weg" };
    return { status: "ok", waarde: { challenge: r.challenge, userHandle: r.userHandle } };
  } catch {
    return { status: "weg" };
  }
}
