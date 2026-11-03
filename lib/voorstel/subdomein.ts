// ---------------------------------------------------------------------------
// Ontwerpvoorstellen op een eigen subdomein, bv. schwarzwald.zekerflex.com.
// Caddy zet de kop x-zf-voorstel alleen in het blok voor dat subdomein en haalt
// hem weg in de andere blokken (deploy/caddy/Caddyfile), dus een bezoeker kan
// hem niet vervalsen. Op zo'n subdomein is alleen het voorstel bereikbaar: zijn
// pagina's, zijn eigen API en de bestanden van Next zelf. De rest van ZekerFlex
// (login, dashboards, andere API's) geeft daar 404. Edge-veilig: geen Node-code.
// ---------------------------------------------------------------------------

export const VOORSTEL_HEADER = "x-zf-voorstel";

/** Naam in de kop -> basispad van het voorstel in de app. */
export const VOORSTELLEN: Record<string, string> = {
  schwarzwald: "/voorstel/schwarzwald",
};

/**
 * Welk pad de app moet tonen voor een verzoek op het subdomein, of null als
 * het daar niet bestaat. "/" en "/activiteiten" worden het voorstel; paden die
 * al onder het basispad vallen, de API van het voorstel en losse bestanden
 * (logo, icoon, Next-bestanden) blijven zoals ze zijn.
 */
export function voorstelPad(naam: string | null, pad: string): string | null {
  const basis = naam ? VOORSTELLEN[naam.trim().toLowerCase()] : undefined;
  if (!basis) return null;
  if (pad.startsWith("/_next/")) return pad;
  if (pad.startsWith("/api/")) return pad === `/api${basis}` || pad.startsWith(`/api${basis}/`) ? pad : null;
  // geen ZekerFlex-service-worker op het voorstel: die zou ZekerFlex-pagina's cachen
  if (pad === "/sw.js") return null;
  if (pad === basis || pad.startsWith(`${basis}/`)) return pad;
  if (/\.[a-z0-9]{2,5}$/i.test(pad)) return pad;
  return pad === "/" ? basis : `${basis}${pad}`;
}
