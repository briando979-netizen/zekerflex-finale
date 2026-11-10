import { sign, type KeyObject } from "node:crypto";

// Sleutels van Apple (.p8, ES256): gedeeld door de pushmeldingen naar de iPhone-app
// (lib/notifications/push/apns.ts) en inloggen met Apple (lib/auth/apple.ts). Puur:
// geen opslag, geen log, en de sleutel zelf verlaat dit bestand nooit.

/** Het .p8-bestand mag als PEM (met echte of geschreven \n) of als base64 in de omgeving staan. */
export function leesP8(waarde: string): string {
  const s = waarde.trim();
  if (s.includes("BEGIN PRIVATE KEY")) return s.replace(/\\n/g, "\n");
  const pem = Buffer.from(s, "base64").toString("utf8");
  return pem.includes("BEGIN PRIVATE KEY") ? pem : "";
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

/** Een JWT met ES256 (de handtekening in het formaat dat Apple vraagt: r‖s, geen DER). */
export function es256Jwt(sleutel: KeyObject, keyId: string, inhoud: Record<string, unknown>): string {
  const kop = b64url(JSON.stringify({ alg: "ES256", kid: keyId }));
  const romp = b64url(JSON.stringify(inhoud));
  const handtekening = sign("sha256", Buffer.from(`${kop}.${romp}`), { key: sleutel, dsaEncoding: "ieee-p1363" });
  return `${kop}.${romp}.${b64url(handtekening)}`;
}
