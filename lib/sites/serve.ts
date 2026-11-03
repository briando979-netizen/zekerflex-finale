import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { logger } from "@/lib/logger";
import { sendMail } from "@/lib/mail";
import { clientIp } from "@/lib/http/request";
import { enforceRateLimit, privateRateLimitIdentifier } from "@/lib/rate-limit";
import { siteHostCsp } from "@/lib/security/csp";
import { SITE_FONT_FILES, renderPage, renderRobots, renderSitemap, renderSystemPage, siteCss, type RenderOptions } from "@/lib/sites/render";
import { readMedia, storeContactMessage, type LiveSite } from "@/lib/sites/store";
import { siteVacancies, vacancyCount } from "@/lib/sites/vacancies";
import type { Page } from "@/lib/sites/types";

// ---------------------------------------------------------------------------
// Serving a published site — shared by /site/<naam>/… (on zekerflex.com, kept
// out of search engines) and the company's own domain (app/site-domein). Pages
// come from the published snapshot (lib/sites/render.ts): no scripts, our own
// photos only, a sandboxed origin.
// ---------------------------------------------------------------------------

export interface ServeOptions extends RenderOptions {
  noindex: boolean;
}

export function siteHeaders(type: string, cache: string, opts: Pick<ServeOptions, "origin" | "noindex">): HeadersInit {
  return {
    "Content-Type": type,
    "Cache-Control": cache,
    "Content-Security-Policy": siteHostCsp(opts.origin),
    ...(opts.noindex ? { "X-Robots-Tag": "noindex" } : {}),
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  };
}

export function siteText(body: string, status: number, opts: Pick<ServeOptions, "origin" | "noindex">): Response {
  return new Response(body, { status, headers: siteHeaders("text/plain; charset=utf-8", "no-store", opts) });
}

/** A design proposal past its date shows nothing any more. */
export const proposalExpired = (snapshot: LiveSite["snapshot"], now = Date.now()) => Boolean(snapshot.voorstel && !(Date.parse(snapshot.voorstel.verloopt) > now));

/** GET one path of a live site: a page, the stylesheet, a photo, the sitemap or robots.txt. */
export async function serveSitePath(live: LiveSite, path: string[], given: ServeOptions): Promise<Response> {
  const { snapshot, siteId } = live;
  // a proposal stays out of search engines wherever it is shown
  const opts: ServeOptions = snapshot.voorstel ? { ...given, noindex: true } : given;
  if (proposalExpired(snapshot)) return siteText("Dit ontwerpvoorstel is verlopen. Wil je het opnieuw zien? Neem contact op met ZekerFlex.", 410, opts);
  const html = (body: string, status = 200) => new Response(body, { status, headers: siteHeaders("text/html; charset=utf-8", "public, max-age=60", opts) });
  // a vacatures block shows the company's open shifts live; an example or a proposal has none and shows an example
  const withVacancies = async (page: Page): Promise<ServeOptions> => {
    const n = vacancyCount(page);
    if (!n || snapshot.voorbeeld || snapshot.voorstel) return opts;
    return { ...opts, vacatures: await siteVacancies(snapshot.tenantId, n) };
  };
  const [first, second, ...rest] = path;
  if (!first) {
    const home = snapshot.pages.find((p) => p.slug === "");
    return home ? html(renderPage(snapshot, home, await withVacancies(home))) : siteText("Deze website bestaat niet (meer).", 404, opts);
  }
  if (first === "assets" && second === "site.css" && rest.length === 0) {
    return new Response(siteCss(snapshot.theme), { headers: siteHeaders("text/css; charset=utf-8", "public, max-age=31536000, immutable", opts) });
  }
  // the premium style's fonts, from the site itself (only the known files, from our own public/fonts)
  if (first === "assets" && second === "fonts" && rest.length === 1) {
    const file = rest[0] ?? "";
    if (!(SITE_FONT_FILES as readonly string[]).includes(file)) return siteText("Dit bestand bestaat niet.", 404, opts);
    try {
      const body = await readFile(join(process.cwd(), "public", "fonts", file));
      // a sandboxed page has an opaque origin, so its fonts load cross-origin and need CORS
      return new Response(new Uint8Array(body), { headers: { ...siteHeaders("font/woff2", "public, max-age=31536000, immutable", opts), "Access-Control-Allow-Origin": "*" } });
    } catch {
      return siteText("Dit bestand bestaat niet.", 404, opts);
    }
  }
  if (first === "media" && second && rest.length === 0) {
    try {
      return new Response(new Uint8Array(await readMedia(siteId, second)), { headers: siteHeaders("image/webp", "public, max-age=31536000, immutable", opts) });
    } catch {
      return siteText("Deze foto bestaat niet (meer).", 404, opts);
    }
  }
  if (first === "sitemap.xml" && !second) return new Response(renderSitemap(snapshot, opts), { headers: siteHeaders("application/xml; charset=utf-8", "public, max-age=300", opts) });
  if (first === "robots.txt" && !second) return new Response(renderRobots(opts), { headers: siteHeaders("text/plain; charset=utf-8", "public, max-age=300", opts) });
  if (!second) {
    const page = snapshot.pages.find((p) => p.slug === first);
    if (page) return html(renderPage(snapshot, page, await withVacancies(page)));
    if (first === "privacy" || first === "bedankt") return html(renderSystemPage(snapshot, first, opts));
  }
  return html(renderSystemPage(snapshot, "404", opts), 404);
}

const clip = (v: FormDataEntryValue | null, max: number) => String(v ?? "").trim().slice(0, max);

/**
 * POST …/_zf/contact: rate limits, a honeypot, then the message is stored,
 * mailed to the company and the visitor goes to the thank-you page.
 * `address` is how the mail names the site; `thanks` where the visitor lands.
 */
export async function handleSiteContact(request: Request, live: LiveSite, opts: Pick<ServeOptions, "origin" | "noindex"> & { thanks: string; address: string }): Promise<Response> {
  if (live.snapshot.voorbeeld) return siteText("Dit is een voorbeeldwebsite: berichten worden niet verstuurd.", 403, opts);
  // a proposal carries the real company's e-mail address: nothing may ever be sent to it from here
  if (live.snapshot.voorstel) return siteText("Dit is een ontwerpvoorstel: berichten worden niet verstuurd.", 403, opts);
  const thanks = new Response(null, { status: 303, headers: { Location: opts.thanks } });
  try {
    await enforceRateLimit({ name: "site-contact-ip", identifier: privateRateLimitIdentifier(clientIp(request)), limit: 5, windowSeconds: 600, message: "Te veel berichten. Probeer het later opnieuw." });
    await enforceRateLimit({ name: "site-contact-site", identifier: live.siteId, limit: 200, windowSeconds: 86_400, message: "Deze website ontvangt vandaag geen berichten meer." });
  } catch {
    return siteText("Te veel berichten in korte tijd. Probeer het later opnieuw.", 429, opts);
  }

  const form = await request.formData().catch(() => null);
  if (!form) return siteText("Ongeldig formulier.", 400, opts);
  // honeypot: people never fill the hidden field, bots do — pretend all went well
  if (clip(form.get("website"), 200)) return thanks;
  const msg = { naam: clip(form.get("naam"), 100), email: clip(form.get("email"), 200), telefoon: clip(form.get("telefoon"), 30), bericht: clip(form.get("bericht"), 4000) };
  if (!msg.naam || !msg.bericht || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(msg.email)) {
    return siteText("Vul je naam, een geldig e-mailadres en je bericht in. Ga terug en probeer het opnieuw.", 400, opts);
  }

  await storeContactMessage(live.siteId, msg);
  const to = live.snapshot.bedrijf.email;
  if (to) {
    await sendMail({
      to,
      replyTo: msg.email,
      kind: "site-contact",
      subject: `Nieuw bericht via je website van ${msg.naam}`,
      text: `${msg.naam} stuurde een bericht via ${opts.address}.\n\nE-mail: ${msg.email}\nTelefoon: ${msg.telefoon || "niet ingevuld"}\n\n${msg.bericht}\n\nBeantwoord deze mail om direct te reageren. Je vindt al je berichten ook in ZekerFlex onder Website.`,
    }).catch((err) => logger.warn("site contact mail failed", { siteId: live.siteId, err: String(err) }));
  }
  return thanks;
}
