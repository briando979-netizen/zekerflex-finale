import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { logger } from "@/lib/logger";
import { sendMail } from "@/lib/mail";
import { clientIp } from "@/lib/http/request";
import { enforceRateLimit, privateRateLimitIdentifier } from "@/lib/rate-limit";
import { siteHostCsp } from "@/lib/security/csp";
import { SITE_FONT_FILES, renderFunctiesPagina, renderPage, renderReserveerPagina, renderRobots, renderSitemap, renderSystemPage, renderWinkelPagina, siteCss, type RenderOptions } from "@/lib/sites/render";
import { reserveerBlokVan } from "@/lib/sites/reserveren";
import { heeftBurger } from "@/lib/sites/burger3d";
import { gereserveerdPagina, reserveerStaat } from "@/lib/sites/reserveringen-opslag";
import { LEGE_INVOER, MAX_PER_PRODUCT, isBestelnummer, zichtbareProducten } from "@/lib/sites/winkel";
import { leesMand, mandCookie, mandMetProducten, mandNaarInvoer, voegToe, zetAantal } from "@/lib/sites/mand";
import { leesFilter } from "@/lib/sites/winkel-filter";
import { readMedia, storeContactMessage, type LiveSite } from "@/lib/sites/store";
import { recordSiteView } from "@/lib/sites/stats";
import { classifyVisit, visitHeadersOf } from "@/lib/sites/stats-shared";
import { siteVacancies, vacancyCount } from "@/lib/sites/vacancies";
import type { Page } from "@/lib/sites/types";
import { chatAan } from "@/lib/sitechat/site-instelling";
import { serveSiteChat } from "@/lib/sitechat/site-pagina";

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

/**
 * GET one path of a live site: a page, the stylesheet, a photo, the sitemap or robots.txt.
 * With the `request`, a page view counts toward the company's visitor figures.
 */
export async function serveSitePath(live: LiveSite, path: string[], given: ServeOptions, request?: Request): Promise<Response> {
  const { snapshot, siteId } = live;
  // a proposal stays out of search engines wherever it is shown
  const basis: ServeOptions = snapshot.voorstel ? { ...given, noindex: true } : given;
  if (proposalExpired(snapshot)) return siteText("Dit ontwerpvoorstel is verlopen. Wil je het opnieuw zien? Neem contact op met ZekerFlex.", 410, basis);
  // a site with a shop has a cart (lib/sites/mand.ts): the number shows in the header, so its pages are per visitor
  const winkel = snapshot.winkel && snapshot.winkel.bestellen && zichtbareProducten(snapshot.winkel).length ? snapshot.winkel : null;
  const mand = winkel ? mandMetProducten(winkel, leesMand(request?.headers.get("cookie"))) : null;
  const opts: ServeOptions = mand ? { ...basis, mandAantal: mand.aantal } : basis;
  const html = (body: string, status = 200) => new Response(body, { status, headers: siteHeaders("text/html; charset=utf-8", mand ? "private, no-cache" : "public, max-age=60", opts) });
  // a vacatures block shows the company's open shifts live; an example or a proposal has none and shows an example
  const withVacancies = async (page: Page): Promise<ServeOptions> => {
    const n = vacancyCount(page);
    if (!n || snapshot.voorbeeld || snapshot.voorstel) return opts;
    return { ...opts, vacatures: await siteVacancies(snapshot.tenantId, n) };
  };
  // the chat link at the bottom right (lib/sitechat): on by choice, or by default for new sites
  const pageOpts = async (page: Page): Promise<ServeOptions> => ({ ...(await withVacancies(page)), chat: await chatAan({ id: siteId, createdAt: snapshot.createdAt }) });
  // a page view of a real site counts (lib/sites/stats.ts); never for an example or a proposal,
  // and never in the way of the page itself
  const count = (page: Pick<Page, "slug">) => {
    if (!request || snapshot.voorbeeld || snapshot.voorstel) return;
    const visit = classifyVisit(visitHeadersOf(request), [new URL(opts.origin).hostname]);
    if (visit) void recordSiteView(siteId, page.slug, visit).catch(() => undefined);
  };
  const [first, second, ...rest] = path;
  if (!first) {
    const home = snapshot.pages.find((p) => p.slug === "");
    if (!home) return siteText("Deze website bestaat niet (meer).", 404, opts);
    count(home);
    return html(renderPage(snapshot, home, await pageOpts(home)));
  }
  // the chat page: plain HTML with forms (lib/sitechat/site-pagina.ts)
  if (first === "_zf" && second === "chat" && rest.length === 0) {
    return serveSiteChat(live, { root: opts.root, origin: opts.origin, version: opts.version, noindex: true }, request ?? new Request(`${opts.origin}${opts.root}_zf/chat`));
  }
  if (first === "assets" && second === "site.css" && rest.length === 0) {
    // the 3D burger's styles (with movement) only for a site that has one (lib/sites/burger3d.ts)
    return new Response(siteCss(snapshot.theme, undefined, heeftBurger(snapshot.pages)), { headers: siteHeaders("text/css; charset=utf-8", "public, max-age=31536000, immutable", opts) });
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
  // the shop (lib/sites/winkel-render.ts): a product page counts as "p/<slug>" in the visitor figures
  if (first === "p" && second && rest.length === 0) {
    const doc = renderWinkelPagina(snapshot, { soort: "product", slug: second }, opts);
    if (doc) {
      count({ slug: `p/${second}` });
      return html(doc);
    }
  }
  if (!second) {
    const page = snapshot.pages.find((p) => p.slug === first);
    if (page) {
      count(page);
      return html(renderPage(snapshot, page, await pageOpts(page)));
    }
    if (first === "privacy" || first === "bedankt") return html(renderSystemPage(snapshot, first, opts));
    // "Bekijk wat deze site kan": only on a proposal or an example (lib/sites/wat-kan-deze-site.ts)
    if (first === "wat-kan-deze-site") {
      const doc = renderFunctiesPagina(snapshot, { ...opts, chat: await chatAan({ id: siteId, createdAt: snapshot.createdAt }) });
      if (doc) return html(doc);
    }
    const q = new URL(request?.url ?? "http://zf/").searchParams;
    if (first === "winkel") {
      count({ slug: "winkel" });
      // zoeken, filteren en sorteren (lib/sites/winkel-filter.ts)
      return html(renderWinkelPagina(snapshot, { soort: "winkel", filter: leesFilter(q) }, opts) ?? "");
    }
    // the cart: ?voeg=<id>&aantal=&o0=&o1= adds, ?zet=<regel>&aantal= changes, ?weg=<regel> removes; then back to …/mand
    if (first === "mand" && winkel && mand) {
      const regels = leesMand(request?.headers.get("cookie"));
      const naar = (nieuw: typeof regels, query: string) =>
        new Response(null, { status: 303, headers: { Location: `${opts.root}mand${query}`, "Set-Cookie": mandCookie(nieuw, opts.root, opts.origin.startsWith("https:")), "Cache-Control": "no-store" } });
      const voeg = q.get("voeg");
      if (voeg) {
        const p = zichtbareProducten(winkel).find((x) => x.id === voeg);
        if (!p) return naar(regels, "?klaar=weg");
        const aantal = Math.max(1, Math.min(MAX_PER_PRODUCT, Math.floor(Number(q.get("aantal") ?? 1)) || 1));
        const keuzes = [q.get("o0") ?? "", q.get("o1") ?? ""].slice(0, (p.opties ?? []).length).map((s) => s.slice(0, 40));
        return naar(voegToe(regels, { productId: p.id, aantal, keuzes }), `?toegevoegd=${p.id}`);
      }
      if (q.has("zet")) return naar(zetAantal(regels, Number(q.get("zet")), Number(q.get("aantal") ?? 1)), "?klaar=bijgewerkt");
      if (q.has("weg")) return naar(zetAantal(regels, Number(q.get("weg")), 0), "?klaar=verwijderd");
      const erbij = zichtbareProducten(winkel).find((x) => x.id === q.get("toegevoegd"));
      const meldingen: Record<string, string> = { bijgewerkt: "Je winkelmand is bijgewerkt.", verwijderd: "Verwijderd uit je winkelmand.", weg: "Dat product is er niet meer." };
      const melding = erbij ? `${erbij.naam} staat in je winkelmand.` : (meldingen[q.get("klaar") ?? ""] ?? "");
      return new Response(renderWinkelPagina(snapshot, { soort: "mand", mand, melding }, opts), { headers: siteHeaders("text/html; charset=utf-8", "no-store", opts) });
    }
    if (first === "bestellen") {
      // from a product page: ?p=<id>&aantal=<n>&o0=<maat>&o1=<kleur> fills in that product
      const p = q.get("p") ?? "";
      const n = Math.max(1, Math.min(MAX_PER_PRODUCT, Math.floor(Number(q.get("aantal") ?? 1)) || 1));
      const keuze = [q.get("o0") ?? "", q.get("o1") ?? ""].map((s) => s.slice(0, 40));
      const los = /^p[a-z0-9]{6,20}$/.test(p) ? { ...LEGE_INVOER, aantallen: { [p]: n }, keuzes: { [p]: keuze } } : undefined;
      // otherwise from the cart: only what is in it
      const uitMand = !los && mand ? mandNaarInvoer(mand.regels) : null;
      const vanMand = Boolean(uitMand && Object.keys(uitMand.aantallen).length);
      const invoer = los ?? (vanMand && uitMand ? uitMand : undefined);
      return new Response(renderWinkelPagina(snapshot, { soort: "bestellen", invoer, vanMand }, opts), { headers: siteHeaders("text/html; charset=utf-8", "no-store", opts) });
    }
    if (first === "besteld") {
      const nr = q.get("nr") ?? "";
      // an example or proposal stores nothing: it shows what the confirmation looks like
      const voorbeeld = q.get("voorbeeld") === "1" && Boolean(snapshot.voorbeeld || snapshot.voorstel);
      return new Response(renderWinkelPagina(snapshot, { soort: "besteld", nr: isBestelnummer(nr) ? nr : "", voorbeeld }, opts), { headers: siteHeaders("text/html; charset=utf-8", "no-store", opts) });
    }
    // reserving a table (lib/sites/reserveren.ts): the free times are live, so never cached
    if (first === "reserveren" || first === "gereserveerd") {
      const blok = reserveerBlokVan(snapshot.pages);
      if (blok) {
        if (first === "reserveren") count({ slug: "reserveren" });
        const w = first === "reserveren" ? await reserveerStaat(live, blok, q) : await gereserveerdPagina(live, q);
        const doc = renderReserveerPagina(snapshot, w, opts);
        if (doc) return new Response(doc, { headers: siteHeaders("text/html; charset=utf-8", "no-store", opts) });
      }
    }
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
