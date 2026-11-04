import { SITE_HOST_HEADER, siteHostFrom } from "@/lib/sites/host-header";
import { rijschoolVoorHost, verificatieRegel } from "@/lib/rijschool/domein";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// /.well-known/zekerflex-site op het eigen domein van een rijschool komt hier
// (lib/rijschool/domein-pad.ts). De https-controle (lib/sites/domain.ts,
// probeHttps) haalt dit op via onze eigen Caddy; klopt de regel, dan is het
// domein actief. Alleen op een echt klantdomein: Caddy zet de kop, en haalt
// hem op zekerflex.com zelf weg.
export async function GET(request: Request): Promise<Response> {
  const host = siteHostFrom(request.headers.get(SITE_HOST_HEADER));
  const r = host ? await rijschoolVoorHost(host).catch(() => null) : null;
  if (!r) return new Response("Niet gevonden", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(verificatieRegel(r.id), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
