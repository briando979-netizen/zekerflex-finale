import { SITE_HOST_HEADER, siteHostFrom } from "@/lib/sites/host-header";
import { siteForHost, verificationRecord } from "@/lib/sites/domain";
import { handleSiteContact, serveSitePath, siteText, type ServeOptions } from "@/lib/sites/serve";
import { handleSiteOrder } from "@/lib/sites/bestellingen";
import { handleSiteReservering } from "@/lib/sites/reserveringen";
import { handleSiteChat } from "@/lib/sitechat/site-pagina";
import { handleVoorraadMelding } from "@/lib/sites/voorraadmelding-opslag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// A company's website on its own domain (lib/sites/domain.ts). Caddy sends
// every request for a customer domain here with the x-zf-site-host header and
// the middleware rewrites bakkerjansen.nl/contact to /site-domein/bakkerjansen.nl/contact.
// Without that header (someone typing /site-domein/… on zekerflex.com) there is
// nothing here. The www form redirects to the address the company chose;
// /.well-known/zekerflex-site answers the https self-check.
// ---------------------------------------------------------------------------

const optsFor = (host: string): Pick<ServeOptions, "origin" | "noindex"> => ({ origin: `https://${host}`, noindex: false });

/** The host, only when the request really came in on that domain. */
function hostOf(request: Request, param: string): string | null {
  const host = siteHostFrom(param);
  return host && siteHostFrom(request.headers.get(SITE_HOST_HEADER)) === host ? host : null;
}

const notLinked = (host: string) =>
  siteText("Op dit adres staat (nog) geen website. Is dit jouw domein? Koppel het in ZekerFlex onder Website, Domein.", 404, { origin: `https://${host}`, noindex: true });

export async function GET(request: Request, { params }: { params: Promise<{ host: string; path?: string[] }> }): Promise<Response> {
  const { host: param, path = [] } = await params;
  const host = hostOf(request, param);
  if (!host) return new Response("Niet gevonden", { status: 404 });
  const found = await siteForHost(host).catch(() => null);
  if (!found) return notLinked(host);
  const { live, primary } = found;
  const opts = optsFor(primary);
  if (host !== primary) {
    const to = `https://${primary}/${path.map(encodeURIComponent).join("/")}${new URL(request.url).search}`;
    return new Response(null, { status: 308, headers: { Location: to, "Cache-Control": "public, max-age=300" } });
  }
  if (path.join("/") === ".well-known/zekerflex-site") return siteText(verificationRecord(live.siteId), 200, opts);
  return serveSitePath(live, path, { ...opts, root: "/", version: live.buildId }, request);
}

export async function POST(request: Request, { params }: { params: Promise<{ host: string; path?: string[] }> }): Promise<Response> {
  const { host: param, path = [] } = await params;
  const host = hostOf(request, param);
  if (!host) return new Response("Niet gevonden", { status: 404 });
  const doel = path.join("/");
  if (doel !== "_zf/contact" && doel !== "_zf/bestelling" && doel !== "_zf/chat" && doel !== "_zf/reservering" && doel !== "_zf/voorraadmelding") return new Response("Niet toegestaan", { status: 405 });
  const found = await siteForHost(host).catch(() => null);
  if (!found) return notLinked(host);
  // the chat (lib/sitechat/site-pagina.ts)
  if (doel === "_zf/chat") return handleSiteChat(request, found.live, { ...optsFor(found.primary), root: "/", version: found.live.buildId, address: `https://${found.primary}` });
  // the shop's order form (lib/sites/bestellingen.ts)
  if (doel === "_zf/bestelling") return handleSiteOrder(request, found.live, { ...optsFor(found.primary), root: "/", version: found.live.buildId, besteld: "/besteld", address: `https://${found.primary}` });
  // reserving a table (lib/sites/reserveringen.ts)
  if (doel === "_zf/reservering") return handleSiteReservering(request, found.live, { ...optsFor(found.primary), root: "/", version: found.live.buildId, gereserveerd: "/gereserveerd", address: `https://${found.primary}` });
  // "mail me als het er weer is" (lib/sites/voorraadmelding-opslag.ts)
  if (doel === "_zf/voorraadmelding") return handleVoorraadMelding(request, found.live, { ...optsFor(found.primary), root: "/" });
  return handleSiteContact(request, found.live, { ...optsFor(found.primary), thanks: "/bedankt", address: `https://${found.primary}` });
}
