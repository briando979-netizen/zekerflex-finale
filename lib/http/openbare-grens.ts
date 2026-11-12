// ---------------------------------------------------------------------------
// De centrale groottegrens voor openbare schrijfroutes (12 nov 2026, beveiligingsronde met 86). De middleware weigert
// een POST/PUT/PATCH op een openbare /api-route (lib/auth/public-routes.ts) met 413 zodra Content-Length boven de
// grens ligt, nog voordat de route de body leest. Ingelogde routes blijven ongemoeid. Chunked verzoeken zonder
// Content-Length vangt Caddy (25 MB) en, waar nodig, lib/http/body-grens.ts in de route zelf. Puur bestand.
//
// Een openbare route die bestanden aanneemt, staat in UITZONDERINGEN; tests/openbare-grens-middleware.test.ts eist dat.
// ---------------------------------------------------------------------------

export const STANDAARD_GRENS = 1_000_000;

export interface Uitzondering {
  /** het pad of het voorvoegsel (zoals in public-routes.ts) */
  pad: string;
  max: number;
  reden: string;
}

export const UITZONDERINGEN: readonly Uitzondering[] = [
  { pad: "/api/id-overdracht/klaar", max: 26_000_000, reden: "de foto's van de ID-scan via de QR-code (max 8 MB elk; Caddy kapt af op 25 MB)" },
  { pad: "/api/id-overdracht/lezen", max: 13_000_000, reden: "één foto van het document om de code te lezen (max 12 MB)" },
  { pad: "/api/id-overdracht/document-live", max: 1_600_000, reden: "de live uitsnede van het kader (max 1,5 MB)" },
  { pad: "/api/werken-bij", max: 26_000_000, reden: "cv of motivatie als bestand (UPLOAD_MAX_BYTES, 25 MB)" },
  { pad: "/api/webhooks/stripe", max: 2_000_000, reden: "een Stripe-event (lib/http/webhook-lezen.ts, 2 MB)" },
  { pad: "/api/webhooks/didit", max: 2_000_000, reden: "een Didit-uitslag (lib/http/webhook-lezen.ts, 2 MB)" },
];

const LEZEN = new Set(["GET", "HEAD", "OPTIONS"]);

/** De grens voor dit pad: de uitzondering als die er is, anders 1 MB. */
export function maxVoor(pad: string): number {
  const u = UITZONDERINGEN.find((x) => pad === x.pad || pad.startsWith(`${x.pad}/`));
  return u?.max ?? STANDAARD_GRENS;
}

/** Is dit verzoek te groot? Alleen schrijven, alleen openbare /api-routes, alleen op een opgegeven Content-Length. */
export function teGroot(methode: string, pad: string, contentLength: string | null, openbaar: boolean): boolean {
  if (LEZEN.has(methode.toUpperCase()) || !pad.startsWith("/api/") || !openbaar) return false;
  if (contentLength === null || contentLength.trim() === "") return false;
  const n = Number(contentLength);
  return Number.isFinite(n) && n > maxVoor(pad);
}

export const TE_GROOT_ANTWOORD = { error: { code: "TE_GROOT", message: "Het verzoek is te groot." } } as const;
