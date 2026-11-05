import { createHmac } from "node:crypto";

// ---------------------------------------------------------------------------
// Ingebedde Metabase-dashboards: een getekende link (JWT, HS256) met het
// dashboard en de vastgezette parameters (het bedrijf). Metabase controleert de
// handtekening met zijn eigen inbedsleutel en laat alleen díe gegevens zien.
// Puur, dus los te testen; de sleutel komt uit lib/bi/metabase.ts.
// ---------------------------------------------------------------------------

const b64url = (s: Buffer | string) => Buffer.from(s).toString("base64url");

/** Een inbedtoken voor een dashboard; `params` zijn de vastgezette (locked) waarden. */
export function inbedToken(geheim: string, dashboardId: number, params: Record<string, string>, geldigSec = 10 * 60, nu = Date.now()): string {
  const kop = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const inhoud = b64url(JSON.stringify({ resource: { dashboard: dashboardId }, params, exp: Math.floor(nu / 1000) + geldigSec }));
  const handtekening = createHmac("sha256", geheim).update(`${kop}.${inhoud}`).digest("base64url");
  return `${kop}.${inhoud}.${handtekening}`;
}

/** De volledige iframe-link: zonder randen, met titel, in de kleuren van Metabase zelf. */
export function inbedUrl(publiekeMetabaseUrl: string, token: string, opties: { titel?: boolean; rand?: boolean; thema?: "light" | "night" } = {}): string {
  const hash = [`bordered=${opties.rand ? "true" : "false"}`, `titled=${opties.titel ? "true" : "false"}`, ...(opties.thema === "night" ? ["theme=night"] : [])].join("&");
  return `${publiekeMetabaseUrl.replace(/\/$/, "")}/embed/dashboard/${token}#${hash}`;
}

/** Metabase eist een inbedsleutel van 64 hexadecimale tekens. */
export const geldigeInbedsleutel = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f]{64}$/i.test(s);
