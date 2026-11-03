import { env } from "@/lib/env";

// ---------------------------------------------------------------------------
// Inloggen met Google voor Schwarzwald-accounts (eigen OAuth-stroom, los van
// de ZekerFlex-login). Zelfde Google-client als ZekerFlex; de terugkeer-
// adressen hieronder moeten in Google Cloud bij die client staan.
// ---------------------------------------------------------------------------

export const GOOGLE_COOKIE = "schw_google";
export const GOOGLE_PAD = "/api/voorstel/schwarzwald/google";

const TOEGESTAAN = new Set(["schwarzwald.zekerflex.com", "zekerflex.com", "www.zekerflex.com"]);

export const googleAan = () => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

/** Het publieke adres waarop de bezoeker zit (achter Caddy), alleen voor onze eigen hosts. */
export function publiekeOrigin(headers: Headers): string | null {
  const host = (headers.get("x-forwarded-host")?.split(",")[0] ?? headers.get("host") ?? "").trim().toLowerCase();
  if (TOEGESTAAN.has(host)) return `https://${host}`;
  if (process.env.NODE_ENV !== "production" && /^localhost:\d+$/.test(host)) return `http://${host}`;
  return null;
}

export const terugkeerAdres = (origin: string) => `${origin}${GOOGLE_PAD}/terug`;

export interface GoogleState {
  /** state */
  s: string;
  /** PKCE-verifier */
  v: string;
  /** publieke origin waar de bezoeker vandaan kwam */
  o: string;
  /** verloopt (ms) */
  x: number;
}
