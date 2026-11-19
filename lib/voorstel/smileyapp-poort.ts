import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { clientIp } from "@/lib/http/request";
import { enforceRateLimit } from "@/lib/rate-limit";
import { zelfdeHerkomst } from "@/lib/voorstel/herkomst";
import { beheerAdres } from "@/lib/voorstel/smileyapp-account-regels";
import { VOORSTEL_HEADER } from "@/lib/voorstel/subdomein";

// ---------------------------------------------------------------------------
// De poort van elke SmileyApp-route (aanvraag, account, beheer). Alles onder
// /api/voorstel/smileyapp is openbaar in lib/auth/public-routes.ts en ook op
// het subdomein bereikbaar, dus elke route begint hier: alleen vanaf de eigen
// site (achter Caddy: Origin tegen Host/X-Forwarded-Host, nooit request.url
// alleen) en een ruime limiet per IP, vóór er een body gelezen of een sessie
// opgezocht wordt. Geeft het IP terug voor de strengere limieten per actie.
// ---------------------------------------------------------------------------

export async function smileyPoort(request: Request, o: { json?: boolean } = {}): Promise<string> {
  // een wijzigend verzoek alleen als JSON: een formulier-post van een andere site kan dat niet zonder preflight
  if (o.json && !(request.headers.get("content-type") ?? "").includes("application/json")) throw AppError.validation("Verwacht JSON.");
  if (!zelfdeHerkomst(request.headers, request.url)) throw AppError.forbidden("Verzoek van een andere website.");
  const ip = clientIp(request);
  // alles wat een body meestuurt: 120 per 10 minuten. Alleen lezen (GET, zonder body) heeft een eigen, ruimere emmer:
  // het beheer ververst de gesprekken vanzelf, en een heel kantoor zit achter één IP.
  if (o.json) await enforceRateLimit({ name: "smileyapp-ip", identifier: ip, limit: 120, windowSeconds: 600 });
  else await enforceRateLimit({ name: "smileyapp-lezen-ip", identifier: ip, limit: 600, windowSeconds: 600 });
  return ip;
}

/** Het adres van het beheer voor een link in een mail: het subdomein als het verzoek daar binnenkwam, anders de hoofdsite. */
export function beheerVan(request: Request): string {
  return beheerAdres({
    host: request.headers.get("x-forwarded-host") ?? request.headers.get("host"),
    voorstelKop: request.headers.get(VOORSTEL_HEADER),
    appBasis: env.APP_BASE_URL,
  });
}
