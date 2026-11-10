import { createPrivateKey, type KeyObject } from "node:crypto";
import { es256Jwt, leesP8 } from "@/lib/apple/sleutel";

// ---------------------------------------------------------------------------
// Inloggen met Apple (web-variant van "Sign in with Apple", via NextAuth in
// lib/auth/nextauth.ts). Aan zodra deze vier op de server staan (owner-todo
// "apple-inloggen"):
//   APPLE_SIWA_SERVICES_ID  de Services ID (bv. com.zekerflex.web): de client_id bij Apple
//   APPLE_TEAM_ID           de Team ID van het ontwikkelaarsaccount
//   APPLE_SIWA_KEY_ID       de Key ID van de sleutel met "Sign in with Apple"
//   APPLE_SIWA_KEY_P8       het .p8-bestand van die sleutel (PEM, of base64 daarvan)
// Ontbreekt er één of is de sleutel onleesbaar, dan is Apple uit en verandert er niets.
//
// Apple kent geen vast client secret: het geheim is een JWT die wij zelf tekenen
// met de .p8 (Apple: hooguit 6 maanden geldig). We maken hem bij gebruik en
// vernieuwen hem elke dag, zodat een server die lang draait nooit met een
// verlopen geheim zit. De sleutel en het geheim komen nooit in een log.
// ---------------------------------------------------------------------------

export interface AppleConfig {
  servicesId: string;
  teamId: string;
  keyId: string;
  sleutel: KeyObject;
}

export const APPLE_AUD = "https://appleid.apple.com";
/** Apple weigert een geheim dat langer dan 6 maanden (15.777.000 s) geldt; wij houden 30 dagen aan. */
export const APPLE_GEHEIM_GELDIG_S = 30 * 24 * 3600;
const VERNIEUW_MS = 24 * 3600 * 1000;

let cache: { bron: string; config: AppleConfig | null } | null = null;

export function appleConfig(omgeving: NodeJS.ProcessEnv = process.env): AppleConfig | null {
  const servicesId = (omgeving.APPLE_SIWA_SERVICES_ID ?? "").trim();
  const teamId = (omgeving.APPLE_TEAM_ID ?? "").trim();
  const keyId = (omgeving.APPLE_SIWA_KEY_ID ?? "").trim();
  const p8 = omgeving.APPLE_SIWA_KEY_P8 ?? "";
  const bron = `${servicesId}|${teamId}|${keyId}|${p8}`;
  if (cache?.bron === bron) return cache.config;
  let config: AppleConfig | null = null;
  const pem = p8 ? leesP8(p8) : "";
  if (pem && /^[A-Za-z0-9][A-Za-z0-9.-]{2,}$/.test(servicesId) && /^[A-Z0-9]{10}$/.test(teamId) && /^[A-Z0-9]{10}$/.test(keyId)) {
    try {
      config = { servicesId, teamId, keyId, sleutel: createPrivateKey(pem) };
    } catch {
      config = null; // onleesbare sleutel: Apple blijft uit (de owner-todo blijft dan open)
    }
  }
  cache = { bron, config };
  return config;
}

/** Het client secret voor Apple: ES256-JWT met iss = team, sub = Services ID, aud = Apple. */
export function appleClientSecret(c: AppleConfig, nu: Date = new Date()): string {
  const iat = Math.floor(nu.getTime() / 1000);
  return es256Jwt(c.sleutel, c.keyId, { iss: c.teamId, iat, exp: iat + APPLE_GEHEIM_GELDIG_S, aud: APPLE_AUD, sub: c.servicesId });
}

let geheimCache: { sleutel: string; geheim: string; tot: number } | null = null;

/** Het geldende geheim; elke dag een nieuw (NextAuth leest het per aanvraag, zie nextauth.ts). */
export function huidigAppleGeheim(c: AppleConfig, nu: number = Date.now()): string {
  const sleutel = `${c.teamId}:${c.keyId}:${c.servicesId}`;
  if (geheimCache && geheimCache.sleutel === sleutel && geheimCache.tot > nu) return geheimCache.geheim;
  const geheim = appleClientSecret(c, new Date(nu));
  geheimCache = { sleutel, geheim, tot: nu + VERNIEUW_MS };
  return geheim;
}

/** email_verified uit het id_token van Apple: soms een boolean, soms de tekst "true"/"false". */
export function appleMailBevestigd(claim: unknown): boolean | null {
  if (claim === true || claim === "true") return true;
  if (claim === false || claim === "false") return false;
  return null;
}

/** "Verberg mijn e-mailadres": een eigen, geldig adres dat Apple doorstuurt. */
export const isAppleRelay = (email: string): boolean => /@privaterelay\.appleid\.com$/i.test(email.trim());

/**
 * De naam die Apple alleen bij de allereerste keer meestuurt (het veld `user` in de
 * POST terug, door NextAuth als `profile.user` doorgegeven). Daarna: null.
 */
export function appleNaam(user: unknown): string | null {
  const naam = (user as { name?: { firstName?: unknown; lastName?: unknown } } | null | undefined)?.name;
  if (!naam) return null;
  const delen = [naam.firstName, naam.lastName].filter((d): d is string => typeof d === "string" && d.trim() !== "").map((d) => d.trim());
  return delen.length ? delen.join(" ").slice(0, 120) : null;
}
