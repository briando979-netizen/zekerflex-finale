import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { DEMO_SLUG, ensureDemoSite } from "@/lib/sites/demo";
import { ensureBrancheVoorbeeld } from "@/lib/sites/branche-demo";
import { brancheVoorbeeldVoorSlug } from "@/lib/sites/branche-voorbeelden";
import { handleSiteContact, serveSitePath, siteText, type ServeOptions } from "@/lib/sites/serve";
import { liveSiteBySlug } from "@/lib/sites/store";
import { handleSiteOrder } from "@/lib/sites/bestellingen";
import { handleSiteChat } from "@/lib/sitechat/site-pagina";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /site/<naam>/… — the websites ZekerFlex hosts for its customers
// (lib/sites/serve.ts). Kept out of search engines on this address; once the
// company's own domain is active (lib/sites/domain.ts), visitors and search
// engines are sent there instead.
// POST /site/<naam>/_zf/contact — the contact form; _zf/bestelling — the shop's order form; _zf/chat — the chat.
// ---------------------------------------------------------------------------

const ORIGIN = new URL(env.APP_BASE_URL).origin;
const BASE: Pick<ServeOptions, "origin" | "noindex"> = { origin: ORIGIN, noindex: true };

export async function GET(request: Request, { params }: { params: Promise<{ slug: string; path?: string[] }> }): Promise<Response> {
  const { slug, path = [] } = await params;
  // the example sites make themselves on the first visit (lib/sites/demo.ts, lib/sites/branche-demo.ts)
  if (slug === DEMO_SLUG) await ensureDemoSite().catch((err) => logger.warn("demo site failed", { err: String(err) }));
  const voorbeeld = brancheVoorbeeldVoorSlug(slug);
  if (voorbeeld) await ensureBrancheVoorbeeld(voorbeeld).catch((err) => logger.warn("branch example failed", { branche: voorbeeld.id, err: String(err) }));
  const live = await liveSiteBySlug(slug).catch(() => null);
  if (!live) return siteText("Deze website bestaat niet (meer).", 404, BASE);
  if (live.domein?.activeAt) {
    const to = `https://${live.domein.host}/${path.map(encodeURIComponent).join("/")}${new URL(request.url).search}`;
    return new Response(null, { status: 308, headers: { Location: to, "Cache-Control": "public, max-age=300" } });
  }
  return serveSitePath(live, path, { ...BASE, root: `/site/${slug}/`, version: live.buildId }, request);
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string; path?: string[] }> }): Promise<Response> {
  const { slug, path = [] } = await params;
  const doel = path.join("/");
  if (doel !== "_zf/contact" && doel !== "_zf/bestelling" && doel !== "_zf/chat") return new Response("Niet toegestaan", { status: 405 });
  const live = await liveSiteBySlug(slug).catch(() => null);
  if (!live) return siteText("Deze website bestaat niet (meer).", 404, BASE);
  // the chat (lib/sitechat/site-pagina.ts): a question, "speak to someone" or an appointment request
  if (doel === "_zf/chat") return handleSiteChat(request, live, { ...BASE, root: `/site/${slug}/`, version: live.buildId, address: `${ORIGIN}/site/${slug}` });
  // the shop's order form (lib/sites/bestellingen.ts)
  if (doel === "_zf/bestelling") return handleSiteOrder(request, live, { ...BASE, root: `/site/${slug}/`, version: live.buildId, besteld: `/site/${slug}/besteld`, address: `${ORIGIN}/site/${slug}` });
  return handleSiteContact(request, live, { ...BASE, thanks: `/site/${slug}/bedankt`, address: `${ORIGIN}/site/${slug}` });
}
