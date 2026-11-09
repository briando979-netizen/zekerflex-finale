import { isIP } from "node:net";

// ---------------------------------------------------------------------------
// Voor welk domein gelden passkeys? Altijd de vaste host uit APP_BASE_URL
// (productie: https://zekerflex.com), nooit request.url: achter Caddy is dat
// app:3000 (zie lib/rijschool/herkomst.ts). De Android-app (TWA) draait in
// Chrome op dezelfde origin, dus daar werkt het vanzelf.
//
// Klantdomeinen en sslip-/nip-adressen (voorbeelden, eigen diensten) doen niet
// mee: een passkey hoort bij één domein, en een IP-adres kan geen rpId zijn.
// ---------------------------------------------------------------------------

export interface PasskeyBron {
  /** het domein waar de passkey bij hoort, bijv. zekerflex.com */
  rpId: string;
  /** de exacte origin die de browser moet melden, bijv. https://zekerflex.com */
  origin: string;
  /** host met eventuele poort, om de echte host van een verzoek mee te vergelijken */
  host: string;
}

/** De passkey-instellingen voor een basisadres, of null als passkeys daar niet kunnen. */
export function passkeyBron(appBaseUrl: string): PasskeyBron | null {
  let u: URL;
  try {
    u = new URL(appBaseUrl);
  } catch {
    return null;
  }
  const naam = u.hostname.toLowerCase();
  if (!naam || isIP(naam.replace(/^\[|\]$/g, "")) !== 0) return null;
  if (/(^|\.)(sslip\.io|nip\.io)$/.test(naam)) return null;
  // WebAuthn vraagt https; alleen localhost mag zonder (ontwikkelen)
  if (u.protocol !== "https:" && !(u.protocol === "http:" && naam === "localhost")) return null;
  return { rpId: naam, origin: u.origin, host: u.host.toLowerCase() };
}

/**
 * Zit de bezoeker op de passkey-host? Alleen om de knop wel of niet te tonen:
 * de echte controle is de origin in clientDataJSON. Achter Caddy staat de echte
 * host in X-Forwarded-Host of Host.
 */
export function opPasskeyHost(headers: Headers, bron: PasskeyBron): boolean {
  const host = (headers.get("x-forwarded-host")?.split(",")[0] ?? headers.get("host") ?? "").trim().toLowerCase();
  return host === bron.host;
}
