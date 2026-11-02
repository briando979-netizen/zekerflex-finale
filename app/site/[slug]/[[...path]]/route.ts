import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { sendMail } from "@/lib/mail";
import { clientIp } from "@/lib/http/request";
import { enforceRateLimit, privateRateLimitIdentifier } from "@/lib/rate-limit";
import { siteHostCsp } from "@/lib/security/csp";
import { renderPage, renderRobots, renderSitemap, renderSystemPage, siteCss, type RenderOptions } from "@/lib/sites/render";
import { liveSiteBySlug, readMedia, storeContactMessage } from "@/lib/sites/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /site/<naam>/… — the websites ZekerFlex hosts for its customers. Pages are
// rendered from the published snapshot (lib/sites/render.ts): no scripts, our
// own photos only, a sandboxed origin. Kept out of search engines on this
// address; an own domain (next phase) is what Google gets to see.
// POST /site/<naam>/_zf/contact — the contact form: stored, mailed to the
// company, then on to the thank-you page.
// ---------------------------------------------------------------------------

const ORIGIN = new URL(env.APP_BASE_URL).origin;

function headers(type: string, cache: string): HeadersInit {
  return {
    "Content-Type": type,
    "Cache-Control": cache,
    "Content-Security-Policy": siteHostCsp(ORIGIN),
    "X-Robots-Tag": "noindex",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  };
}

const notFound = () => new Response("Deze website bestaat niet (meer).", { status: 404, headers: headers("text/plain; charset=utf-8", "no-store") });

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string; path?: string[] }> }): Promise<Response> {
  const { slug, path = [] } = await params;
  const live = await liveSiteBySlug(slug).catch(() => null);
  if (!live) return notFound();
  const { snapshot, buildId, siteId } = live;
  const opts: RenderOptions = { root: `/site/${slug}/`, origin: ORIGIN, version: buildId, noindex: true };
  const html = (body: string, status = 200) => new Response(body, { status, headers: headers("text/html; charset=utf-8", "public, max-age=60") });

  const [first, second, ...rest] = path;
  if (!first) {
    const home = snapshot.pages.find((p) => p.slug === "");
    return home ? html(renderPage(snapshot, home, opts)) : notFound();
  }
  if (first === "assets" && second === "site.css" && rest.length === 0) {
    return new Response(siteCss(snapshot.theme), { headers: headers("text/css; charset=utf-8", "public, max-age=31536000, immutable") });
  }
  if (first === "media" && second && rest.length === 0) {
    try {
      return new Response(new Uint8Array(await readMedia(siteId, second)), { headers: headers("image/webp", "public, max-age=31536000, immutable") });
    } catch {
      return notFound();
    }
  }
  if (first === "sitemap.xml" && !second) return new Response(renderSitemap(snapshot, opts), { headers: headers("application/xml; charset=utf-8", "public, max-age=300") });
  if (first === "robots.txt" && !second) return new Response(renderRobots(opts), { headers: headers("text/plain; charset=utf-8", "public, max-age=300") });
  if (!second) {
    const page = snapshot.pages.find((p) => p.slug === first);
    if (page) return html(renderPage(snapshot, page, opts));
    if (first === "privacy" || first === "bedankt") return html(renderSystemPage(snapshot, first, opts));
  }
  return html(renderSystemPage(snapshot, "404", opts), 404);
}

const clip = (v: FormDataEntryValue | null, max: number) => String(v ?? "").trim().slice(0, max);

export async function POST(request: Request, { params }: { params: Promise<{ slug: string; path?: string[] }> }): Promise<Response> {
  const { slug, path = [] } = await params;
  if (path.join("/") !== "_zf/contact") return new Response("Niet toegestaan", { status: 405 });
  const live = await liveSiteBySlug(slug).catch(() => null);
  if (!live) return notFound();
  const thanks = new Response(null, { status: 303, headers: { Location: `/site/${slug}/bedankt` } });

  try {
    await enforceRateLimit({ name: "site-contact-ip", identifier: privateRateLimitIdentifier(clientIp(request)), limit: 5, windowSeconds: 600, message: "Te veel berichten. Probeer het later opnieuw." });
    await enforceRateLimit({ name: "site-contact-site", identifier: live.siteId, limit: 200, windowSeconds: 86_400, message: "Deze website ontvangt vandaag geen berichten meer." });
  } catch {
    return new Response("Te veel berichten in korte tijd. Probeer het later opnieuw.", { status: 429, headers: headers("text/plain; charset=utf-8", "no-store") });
  }

  const form = await request.formData().catch(() => null);
  if (!form) return new Response("Ongeldig formulier.", { status: 400, headers: headers("text/plain; charset=utf-8", "no-store") });
  // honeypot: people never fill the hidden field, bots do — pretend all went well
  if (clip(form.get("website"), 200)) return thanks;
  const msg = { naam: clip(form.get("naam"), 100), email: clip(form.get("email"), 200), telefoon: clip(form.get("telefoon"), 30), bericht: clip(form.get("bericht"), 4000) };
  if (!msg.naam || !msg.bericht || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(msg.email)) {
    return new Response("Vul je naam, een geldig e-mailadres en je bericht in. Ga terug en probeer het opnieuw.", { status: 400, headers: headers("text/plain; charset=utf-8", "no-store") });
  }

  await storeContactMessage(live.siteId, msg);
  const to = live.snapshot.bedrijf.email;
  if (to) {
    await sendMail({
      to,
      replyTo: msg.email,
      kind: "site-contact",
      subject: `Nieuw bericht via je website van ${msg.naam}`,
      text: `${msg.naam} stuurde een bericht via ${ORIGIN}/site/${slug}.\n\nE-mail: ${msg.email}\nTelefoon: ${msg.telefoon || "niet ingevuld"}\n\n${msg.bericht}\n\nBeantwoord deze mail om direct te reageren. Je vindt al je berichten ook in ZekerFlex onder Website.`,
    }).catch((err) => logger.warn("site contact mail failed", { slug, err: String(err) }));
  }
  return thanks;
}
