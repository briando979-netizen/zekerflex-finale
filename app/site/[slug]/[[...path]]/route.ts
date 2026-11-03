import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { DEMO_SLUG, ensureDemoSite } from "@/lib/sites/demo";
import { handleSiteContact, serveSitePath, siteText, type ServeOptions } from "@/lib/sites/serve";
import { liveSiteBySlug } from "@/lib/sites/store";
import { handleSiteOrder } from "@/lib/sites/bestellingen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /site/<naam>/… — the websites ZekerFlex hosts for its customers
// (lib/sites/serve.ts). Kept out of search engines on this address; once the
// company's own domain is active (lib/sites/domain.ts), visitors and search
// engines are sent there instead.
// POST /site/<naam>/_zf/contact — the contact form; _zf/bestelling — the shop's order form.
// ---------------------------------------------------------------------------

const ORIGIN = new URL(env.APP_BASE_URL).origin;
const BASE: Pick<ServeOptions, "origin" | "noindex"> = { origin: ORIGIN, noindex: true };

export async function GET(request: Request, { params }: { params: Promise<{ slug: string; path?: string[] }> }): Promise<Response> {
  const { slug, path = [] } = await params;
  // the example site makes itself on the first visit (lib/sites/demo.ts)
  if (slug === DEMO_SLUG) await ensureDemoSite().catch((err) => logger.warn("demo site failed", { err: String(err) }));
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
  if (doel !== "_zf/contact" && doel !== "_zf/bestelling") return new Response("Niet toegestaan", { status: 405 });
  const live = await liveSiteBySlug(slug).catch(() => null);
  if (!live) return siteText("Deze website bestaat niet (meer).", 404, BASE);
  // the shop's order form (lib/sites/bestellingen.ts)
  if (doel === "_zf/bestelling") return handleSiteOrder(request, live, { ...BASE, root: `/site/${slug}/`, version: live.buildId, besteld: `/site/${slug}/besteld`, address: `${ORIGIN}/site/${slug}` });
  return handleSiteContact(request, live, { ...BASE, thanks: `/site/${slug}/bedankt`, address: `${ORIGIN}/site/${slug}` });
}
