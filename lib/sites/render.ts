import { ldJson } from "@/lib/seo/json-ld";
import { BLOCK_LABELS, isHexColor, type Block, type Company, type Media, type Page, type SiteDoc, type SiteProposalMark, type Theme } from "@/lib/sites/types";

// ---------------------------------------------------------------------------
// ZekerFlex Sites renderer: site data → HTML pages + one stylesheet. Pure, so
// the builder previews with exactly what visitors get. Everything a customer
// types is escaped; links only allow http(s), mailto, tel, #anchors and our own
// pages (never javascript:); colours must be #rrggbb; photos are our own files.
// No scripts. Links are root-relative from `root` ("/site/<naam>/" on
// zekerflex.com, "/" on an own domain) and carry no trailing slash, so they
// survive Next.js's trailing-slash redirect at any depth.
// ---------------------------------------------------------------------------

/** What rendering needs: the site being edited or a published snapshot. */
export type RenderableSite = Pick<SiteDoc, "pages" | "media" | "theme" | "bedrijf" | "voorbeeld" | "voorstel">;

export interface RenderOptions {
  /** absolute path of the site root, ending in "/": "/site/bakker/" or "/" */
  root: string;
  /** scheme + host, e.g. "https://zekerflex.com" (canonical, sitemap, og:image) */
  origin: string;
  /** cache-buster for the stylesheet (the build id) */
  version?: string | undefined;
  /** preview: one page in the builder (inline CSS, photos from the editor route, links inert) */
  preview?: { mediaUrl: (file: string) => string } | undefined;
  /** keep out of search engines (no own domain yet) */
  noindex?: boolean | undefined;
}

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]!);

/** Paragraphs from plain text: blank line = new paragraph, single newline = line break. */
function paras(text: string): string {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** Pages every published site has besides its own. */
export const SYSTEM_PAGES = ["privacy", "bedankt"];

/** The site's home address without a trailing slash ("/site/bakker"), or "/" on an own domain. */
export const homeHref = (root: string) => (root.length > 1 ? root.slice(0, -1) : "/");

/** Only safe link targets survive; everything else becomes "#". */
export function safeHref(raw: string, root: string, pages: Pick<Page, "slug">[]): string {
  const v = raw.trim();
  if (/^(https?:\/\/|mailto:|tel:)/i.test(v) && !/[\s<>"']/.test(v)) return v;
  if (/^#[\w-]{0,60}$/.test(v)) return v;
  const slug = v.replace(/^\/+|\/+$/g, "").toLowerCase();
  if (slug === "" || slug === "home") return homeHref(root);
  if (/^[a-z0-9-]{1,60}$/.test(slug) && (pages.some((p) => p.slug === slug) || SYSTEM_PAGES.includes(slug))) return `${root}${slug}`;
  return "#";
}

const hexToRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** White or near-black text, whichever has the higher contrast on this colour. */
export function textOn(hex: string): string {
  const l = luminance(hex);
  return (l + 0.05) / 0.057 > 1.05 / (l + 0.05) ? "#141414" : "#ffffff";
}

const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const FONTS: Record<Theme["lettertype"], { kop: string; tekst: string }> = {
  // system fonts: nothing to download, no layout shift, nothing from a third party
  modern: { kop: SANS, tekst: SANS },
  klassiek: { kop: 'Georgia, Cambria, "Times New Roman", serif', tekst: SANS },
  vriendelijk: { kop: '"Trebuchet MS", "Segoe UI", Verdana, sans-serif', tekst: '"Segoe UI", Verdana, system-ui, sans-serif' },
};
/** The book faces most computers already have; Georgia last. */
const LUXE_SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", "URW Palladio L", Georgia, serif';

/** The "luxe" style on top of the base: room, thin gold lines, uppercase small navigation, a tall opening photo. */
function luxeCss(serif: boolean): string {
  const kop = serif ? `h1,h2,h3,.logo{font-family:${LUXE_SERIF};font-weight:500}blockquote p{font-family:${LUXE_SERIF};font-size:1.2rem;line-height:1.6}` : "h1,h2,h3{font-weight:600}";
  return `:root{--ink:#1c1b19;--mute:#6a655d;--line:#e8e3da;--soft:#f6f3ee}body{background:#fdfcfa;font-size:17.5px;line-height:1.75}${kop}
h1{font-size:clamp(2.5rem,6.2vw,4.75rem);line-height:1.04;letter-spacing:-.02em}h2{font-size:clamp(1.85rem,3.6vw,2.9rem);letter-spacing:-.015em}h3{font-size:1.3rem}
section{padding:120px 0}@media (max-width:760px){section{padding:80px 0}}section h2::before{content:"";display:block;width:40px;height:2px;background:var(--a);margin:0 0 24px}.band h2::before{margin:0 auto 24px}
header{background:rgba(253,252,250,.94)}.bar{min-height:84px}.logo{font-size:1.5rem;letter-spacing:.01em}.logo img{max-height:56px}
nav a{border-radius:0;padding:10px 14px;font-size:.76rem;letter-spacing:.14em;text-transform:uppercase}nav a:hover,nav a[aria-current]{background:transparent;color:var(--ink);box-shadow:inset 0 -2px 0 var(--a)}.menu summary{border-radius:0;font-size:.76rem;letter-spacing:.12em;text-transform:uppercase}
.btn{border-radius:0;padding:17px 34px;font-size:.8rem;letter-spacing:.14em;text-transform:uppercase}
.hero{min-height:min(86vh,860px);display:flex;align-items:flex-end;padding:160px 0 104px}.hero .wrap{z-index:1;width:100%}.hero p{font-size:1.22rem;max-width:600px}
.hero.photo{background:#0f0f0e;color:#fff}.hero.photo img{opacity:1}.hero.photo::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(10,10,9,.18) 0%,rgba(10,10,9,.32) 42%,rgba(10,10,9,.82) 100%)}
@media (max-width:760px){.hero{min-height:72vh;padding:120px 0 64px}}
.cards{gap:48px 40px}.card{background:transparent;border:0;border-top:1px solid var(--line);border-radius:0;padding:28px 0 0}.card h3{color:var(--ink)}section.alt .card{border-color:#ddd6ca}
.split{gap:64px}.split img{border-radius:0;aspect-ratio:4/5}.gallery{gap:8px}.gallery img{border-radius:0}.stars{letter-spacing:4px}
.band{background:#151412;color:#f3eee6}.band p{opacity:.85}form.contact input,form.contact textarea{border-radius:0;border-color:#d8d2c7}.hours td{padding:14px 0}footer{background:#121110}`;
}

export function siteCss(theme: Theme): string {
  const kleur = isHexColor(theme.kleur) ? theme.kleur : "#0E5C4A";
  const accent = isHexColor(theme.accent) ? theme.accent : "#F2B544";
  const f = FONTS[theme.lettertype] ?? FONTS.modern;
  const r = theme.hoeken === "strak" ? "4px" : "16px";
  const luxe = theme.stijl === "luxe" ? `\n${luxeCss(theme.lettertype === "klassiek")}` : "";
  return `:root{--k:${kleur};--k-t:${textOn(kleur)};--a:${accent};--a-t:${textOn(accent)};--r:${r};--ink:#16191d;--mute:#5b6470;--line:#e6e8eb;--soft:#f5f6f4}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;font:17px/1.65 ${f.tekst};color:var(--ink);background:#fff;-webkit-font-smoothing:antialiased}
img{max-width:100%;height:auto;display:block}a{color:var(--k)}h1,h2,h3{font-family:${f.kop};line-height:1.15;margin:0 0 .6em;letter-spacing:-.01em}
h1{font-size:clamp(2rem,5vw,3.4rem)}h2{font-size:clamp(1.6rem,3.4vw,2.3rem)}h3{font-size:1.2rem}p{margin:0 0 1em}
.wrap{max-width:1120px;margin:0 auto;padding:0 20px}.narrow{max-width:820px}.skip{position:absolute;left:-999px}.skip:focus{left:12px;top:12px;background:#fff;padding:8px 12px;z-index:9}
header{position:sticky;top:0;z-index:5;background:rgba(255,255,255,.95);border-bottom:1px solid var(--line)}
.bar{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:68px}.logo{font:700 1.2rem/1.2 ${f.kop};color:var(--ink);text-decoration:none}
nav ul{list-style:none;margin:0;padding:0;display:flex;gap:6px}nav a{display:block;padding:8px 12px;border-radius:999px;color:var(--ink);text-decoration:none;font-weight:600;font-size:.95rem}nav a:hover,nav a[aria-current]{background:var(--soft);color:var(--k)}
.menu{display:none}.menu summary{list-style:none;cursor:pointer;padding:8px 14px;border:1px solid var(--line);border-radius:999px;font-weight:600}.menu summary::-webkit-details-marker{display:none}
@media (max-width:760px){.desk{display:none}.menu{display:block;position:relative}.menu ul{position:absolute;right:0;top:48px;background:#fff;border:1px solid var(--line);border-radius:14px;padding:8px;display:grid;min-width:200px;box-shadow:0 12px 30px rgba(0,0,0,.12)}}
section{padding:72px 0}section.alt{background:var(--soft)}.btn{display:inline-block;padding:14px 26px;border-radius:999px;background:var(--a);color:var(--a-t);font-weight:700;text-decoration:none;border:0;font-size:1rem;cursor:pointer}.btn:hover{filter:brightness(.95)}
.hero{position:relative;color:var(--k-t);background:var(--k);padding:96px 0;overflow:hidden}.hero img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.32}.hero .wrap{position:relative}.hero p{font-size:1.2rem;max-width:640px;opacity:.95}.hero h1{max-width:760px}
.split{display:grid;gap:40px;align-items:center}@media (min-width:860px){.split{grid-template-columns:1fr 1fr}.split.flip>:first-child{order:2}}.split img{border-radius:var(--r);width:100%;aspect-ratio:4/3;object-fit:cover}
.cards{display:grid;gap:20px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}.card{background:#fff;border:1px solid var(--line);border-radius:var(--r);padding:26px;margin:0}.card h3{color:var(--k)}section.alt .card{border-color:transparent}
.gallery{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(220px,1fr))}.gallery img{border-radius:var(--r);aspect-ratio:1;object-fit:cover;width:100%}
.gallery.g2{grid-template-columns:repeat(2,1fr)}.gallery.g3{grid-template-columns:repeat(3,1fr)}.gallery.g4,.gallery.bento{grid-template-columns:repeat(4,1fr)}.gallery.bento img:first-child{grid-column:span 2;grid-row:span 2}
@media (max-width:760px){.gallery.g3,.gallery.g4,.gallery.bento{grid-template-columns:repeat(2,1fr)}.gallery.g3 img:last-child:nth-child(odd){grid-column:span 2;aspect-ratio:2/1}}
.stars{color:var(--a);letter-spacing:2px;font-size:1.1rem}blockquote{margin:12px 0}.who{font-weight:700;margin:0}
details.q{border-bottom:1px solid var(--line);padding:16px 0}details.q summary{cursor:pointer;font-weight:700;list-style:none;display:flex;justify-content:space-between;gap:12px}details.q summary::after{content:"+";color:var(--k);font-size:1.4rem;line-height:1}details.q[open] summary::after{content:"–"}details.q p{margin:12px 0 0;color:var(--mute)}
.hours{border-collapse:collapse;width:100%;max-width:520px}.hours td{padding:10px 0;border-bottom:1px solid var(--line)}.hours td+td{text-align:right;font-weight:600}
.band{background:var(--k);color:var(--k-t);text-align:center}.band p{font-size:1.15rem;opacity:.95}
form.contact{display:grid;gap:14px;max-width:620px}form.contact label{display:grid;gap:6px;font-weight:600;font-size:.95rem}form.contact input,form.contact textarea{font:inherit;padding:12px 14px;border:1px solid #cfd4da;border-radius:10px;background:#fff}form.contact textarea{min-height:140px}.hp{position:absolute;left:-5000px}.small{margin:0;color:var(--mute);font-size:.9rem}
.contact-grid{display:grid;gap:40px}@media (min-width:860px){.contact-grid{grid-template-columns:1.3fr 1fr}}.facts{list-style:none;padding:0;margin:0;display:grid;gap:8px}
footer{background:#111417;color:#d7dbe0;padding:48px 0 28px;font-size:.95rem}footer a{color:#fff}footer .cols{display:grid;gap:24px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}footer small{display:block;margin-top:28px;color:#9aa3ad}
:focus-visible{outline:3px solid var(--a);outline-offset:3px}@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
.demo-bar{background:#16191d;color:#fff;text-align:center;font-size:.9rem;line-height:1.5;padding:10px 20px}.demo-bar a{color:#fff;font-weight:700}form.contact :disabled{opacity:.6;cursor:not-allowed}
.logo img{display:block;max-height:48px;width:auto}.socials{display:flex;flex-wrap:wrap;gap:6px 16px}
.wa{position:fixed;right:18px;bottom:18px;z-index:6;display:inline-flex;align-items:center;gap:8px;padding:12px 18px;border-radius:999px;background:#1c7c4b;color:#fff;font-weight:700;text-decoration:none;box-shadow:0 10px 28px rgba(0,0,0,.22)}.wa svg{width:20px;height:20px;fill:currentColor}${luxe}`;
}

/** "06 12345678" → "31612345678", the form wa.me wants; null when it can't be a phone number. */
export function waNumber(raw: string): string | null {
  let d = raw.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  else if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0")) d = `31${d.slice(1)}`;
  return /^[1-9]\d{9,14}$/.test(d) ? d : null;
}

const SOCIAL_NAMES: [RegExp, string][] = [
  [/(^|\.)facebook\.com$/, "Facebook"],
  [/(^|\.)instagram\.com$/, "Instagram"],
  [/(^|\.)linkedin\.com$/, "LinkedIn"],
  [/(^|\.)tiktok\.com$/, "TikTok"],
  [/(^|\.)youtube\.com$/, "YouTube"],
  [/(^|\.)(x|twitter)\.com$/, "X"],
];
/** "https://www.instagram.com/bakkerij" → "Instagram"; another site by its own name. */
export function socialName(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return SOCIAL_NAMES.find(([re]) => re.test(host))?.[1] ?? host.replace(/^www\./, "");
  } catch {
    return "Link";
  }
}

interface Ctx {
  root: string;
  pages: Page[];
  media: Map<string, Media>;
  mediaSrc: (file: string) => string;
  preview: boolean;
  bedrijf: Company;
  /** an example site: a banner, an inert contact form, no business data for search engines */
  voorbeeld: boolean;
  /** a design proposal to a company: the same, with a banner that it is not their official site */
  voorstel: SiteProposalMark | null;
  /** the photo shown as logo in the header */
  logo: Media | undefined;
  /** where "make your own website" points, for the example banner */
  origin: string;
}

function img(ctx: Ctx, id: string | null, sizes: string, eager = false): string {
  const m = id ? ctx.media.get(id) : undefined;
  if (!m) return "";
  return `<img src="${esc(ctx.mediaSrc(m.file))}" alt="${esc(m.alt)}" width="${m.width}" height="${m.height}" sizes="${esc(sizes)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
}

const href = (ctx: Ctx, raw: string) => (ctx.preview ? "#" : safeHref(raw, ctx.root, ctx.pages));

/** Full rows for 2, 3, 4, 6, 8 or 9 photos; five get a large first photo with four small ones (a closed 4×2 block). */
export function galleryClass(n: number): string {
  if (n === 2) return "gallery g2";
  if (n === 3 || n === 6 || n === 9) return "gallery g3";
  if (n === 4 || n === 8) return "gallery g4";
  if (n === 5) return "gallery bento";
  return "gallery";
}

function renderBlock(b: Block, i: number, ctx: Ctx): string {
  const alt = i % 2 === 1 ? ' class="alt"' : "";
  switch (b.type) {
    case "hero": {
      const p = b.props;
      const pic = img(ctx, p.foto, "100vw", true);
      return `<section class="hero${pic ? " photo" : ""}">${pic}<div class="wrap"><h1>${esc(p.kop)}</h1>${paras(p.tekst)}${p.knop ? `<p><a class="btn" href="${esc(href(ctx, p.knopLink))}">${esc(p.knop)}</a></p>` : ""}</div></section>`;
    }
    case "tekst":
      return `<section${alt}><div class="wrap narrow"><h2>${esc(b.props.kop)}</h2>${paras(b.props.tekst)}</div></section>`;
    case "tekstFoto": {
      const p = b.props;
      const pic = img(ctx, p.foto, "(min-width: 860px) 50vw, 100vw");
      // no photo (yet): the text gets the reading width, not half a row next to an empty column
      if (!pic) return `<section${alt}><div class="wrap narrow"><h2>${esc(p.kop)}</h2>${paras(p.tekst)}</div></section>`;
      return `<section${alt}><div class="wrap split${p.fotoLinks ? " flip" : ""}"><div><h2>${esc(p.kop)}</h2>${paras(p.tekst)}</div><div>${pic}</div></div></section>`;
    }
    case "diensten":
      return `<section${alt}><div class="wrap"><h2>${esc(b.props.kop)}</h2><div class="cards">${b.props.items.map((it) => `<div class="card"><h3>${esc(it.titel)}</h3>${paras(it.tekst)}</div>`).join("")}</div></div></section>`;
    case "galerij": {
      const pics = b.props.fotos.map((f) => img(ctx, f, "(min-width: 760px) 33vw, 100vw")).filter(Boolean);
      if (pics.length === 0) return "";
      return `<section${alt}><div class="wrap"><h2>${esc(b.props.kop)}</h2><div class="${galleryClass(pics.length)}">${pics.join("")}</div></div></section>`;
    }
    case "reviews":
      return `<section${alt}><div class="wrap"><h2>${esc(b.props.kop)}</h2><div class="cards">${b.props.items
        .map((r) => {
          const n = Math.max(1, Math.min(5, Math.round(r.sterren)));
          return `<figure class="card"><div class="stars" role="img" aria-label="${n} van de 5 sterren">${"★".repeat(n)}${"☆".repeat(5 - n)}</div><blockquote>${paras(r.tekst)}</blockquote><figcaption class="who">${esc(r.naam)}</figcaption></figure>`;
        })
        .join("")}</div></div></section>`;
    case "faq":
      return `<section${alt}><div class="wrap narrow"><h2>${esc(b.props.kop)}</h2>${b.props.items.map((q) => `<details class="q"><summary>${esc(q.vraag)}</summary>${paras(q.antwoord)}</details>`).join("")}</div></section>`;
    case "openingstijden":
      return `<section${alt}><div class="wrap"><h2>${esc(b.props.kop)}</h2><table class="hours"><tbody>${b.props.regels.map((r) => `<tr><td>${esc(r.dag)}</td><td>${esc(r.tijd)}</td></tr>`).join("")}</tbody></table></div></section>`;
    case "cta":
      return `<section class="band"><div class="wrap"><h2>${esc(b.props.kop)}</h2>${paras(b.props.tekst)}${b.props.knop ? `<a class="btn" href="${esc(href(ctx, b.props.knopLink))}">${esc(b.props.knop)}</a>` : ""}</div></section>`;
    case "contact": {
      const c = ctx.bedrijf;
      // an example or a proposal shows the form, but it sends nothing
      const inert = ctx.voorbeeld || Boolean(ctx.voorstel);
      const off = inert ? " disabled" : "";
      const note = ctx.voorstel
        ? `<p class="small"><strong>Dit is een ontwerpvoorstel:</strong> dit formulier verstuurt nog niets. Op je nieuwe website komen berichten direct bij jou binnen.</p>`
        : ctx.voorbeeld
          ? `<p class="small"><strong>Dit is een voorbeeld:</strong> dit formulier verstuurt niets. Op je eigen website komen berichten bij jou binnen.</p>`
          : `<p class="small">We gebruiken je gegevens alleen om je bericht te beantwoorden. Lees de <a href="${esc(href(ctx, "privacy"))}">privacyverklaring</a>.</p>`;
      const form = b.props.formulier
        ? `<form class="contact" method="post" action="${esc(ctx.preview || inert ? "#" : `${ctx.root}_zf/contact`)}"><label>Naam<input name="naam" required maxlength="100" autocomplete="name"${off}></label><label>E-mailadres<input name="email" type="email" required maxlength="200" autocomplete="email"${off}></label><label>Telefoon (mag leeg)<input name="telefoon" maxlength="30" autocomplete="tel"${off}></label><label>Bericht<textarea name="bericht" required maxlength="4000"${off}></textarea></label><label class="hp" aria-hidden="true">Laat leeg<input name="website" tabindex="-1" autocomplete="off"></label>${note}<p style="margin:0"><button class="btn" type="submit"${off}>Verstuur bericht</button></p></form>`
        : "";
      const place = [c.straat, [c.postcode, c.plaats].filter(Boolean).join(" ")].filter(Boolean).join(", ");
      const wa = c.whatsapp ? waNumber(c.whatsapp) : null;
      const facts = [
        c.telefoon && `<li>Telefoon: <a href="tel:${esc(c.telefoon.replace(/[^\d+]/g, ""))}">${esc(c.telefoon)}</a></li>`,
        wa && `<li>WhatsApp: <a href="${esc(href(ctx, `https://wa.me/${wa}`))}" rel="noopener">stuur een bericht</a></li>`,
        c.email && `<li>E-mail: <a href="mailto:${esc(c.email)}">${esc(c.email)}</a></li>`,
        place && `<li>${esc(place)}</li>`,
      ].filter(Boolean);
      return `<section id="contact"${alt}><div class="wrap contact-grid"><div><h2>${esc(b.props.kop)}</h2>${paras(b.props.tekst)}${form}</div><div><h3>${esc(c.naam)}</h3><ul class="facts">${facts.join("")}</ul></div></div></section>`;
    }
  }
}

function header(ctx: Ctx, current: Page): string {
  const links = ctx.pages
    .map((p) => `<li><a href="${esc(ctx.preview ? "#" : safeHref(p.slug || "home", ctx.root, ctx.pages))}"${p.id === current.id ? ' aria-current="page"' : ""}>${esc(p.titel)}</a></li>`)
    .join("");
  const logo = ctx.logo
    ? `<img src="${esc(ctx.mediaSrc(ctx.logo.file))}" alt="${esc(ctx.bedrijf.naam)}" width="${ctx.logo.width}" height="${ctx.logo.height}" fetchpriority="high" decoding="async">`
    : esc(ctx.bedrijf.naam);
  return `<a class="skip" href="#inhoud">Naar de inhoud</a><header><div class="wrap bar"><a class="logo" href="${esc(ctx.preview ? "#" : homeHref(ctx.root))}">${logo}</a><nav class="desk" aria-label="Hoofdmenu"><ul>${links}</ul></nav><details class="menu"><summary>Menu</summary><nav aria-label="Menu"><ul>${links}</ul></nav></details></div></header>`;
}

function footer(ctx: Ctx): string {
  const c = ctx.bedrijf;
  const address = [c.straat, [c.postcode, c.plaats].filter(Boolean).join(" ")].filter(Boolean);
  const socials = (c.socials ?? [])
    .map((u) => [href(ctx, u), u] as const)
    .filter(([h]) => ctx.preview || h !== "#")
    .map(([h, u]) => `<a href="${esc(h)}" rel="noopener me">${esc(socialName(u))}</a>`);
  return `<footer><div class="wrap"><div class="cols"><div><strong>${esc(c.naam)}</strong>${address.length ? `<p>${address.map(esc).join("<br>")}</p>` : ""}</div><div>${c.telefoon ? `<p>${esc(c.telefoon)}</p>` : ""}${c.email ? `<p><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></p>` : ""}${socials.length ? `<p class="socials">${socials.join("")}</p>` : ""}</div><div>${c.kvk ? `<p>KVK ${esc(c.kvk)}</p>` : ""}<p><a href="${esc(href(ctx, "privacy"))}">Privacyverklaring</a></p></div></div><small>© ${new Date().getFullYear()} ${esc(c.naam)} · Website gemaakt met <a href="https://zekerflex.com" rel="noopener">ZekerFlex</a></small></div></footer>`;
}

/** A WhatsApp button that stays in the corner, when the company has a mobile number for it. */
function whatsappButton(ctx: Ctx): string {
  const wa = ctx.bedrijf.whatsapp ? waNumber(ctx.bedrijf.whatsapp) : null;
  if (!wa) return "";
  return `<a class="wa" href="${esc(href(ctx, `https://wa.me/${wa}`))}" rel="noopener"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3C7 3 3 6.6 3 11c0 2.2 1 4.2 2.7 5.6L5 21l4.3-2.3c.9.2 1.8.3 2.7.3 5 0 9-3.6 9-8s-4-8-9-8z"/></svg>WhatsApp</a>`;
}

function localBusiness(c: Company, url: string, image: string | null): string {
  const data = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: c.naam,
    url,
    ...(c.telefoon ? { telephone: c.telefoon } : {}),
    ...(c.email ? { email: c.email } : {}),
    ...(image ? { image } : {}),
    ...(c.straat || c.plaats ? { address: { "@type": "PostalAddress", streetAddress: c.straat, postalCode: c.postcode, addressLocality: c.plaats, addressCountry: "NL" } } : {}),
  };
  return `<script type="application/ld+json">${ldJson(data)}</script>`;
}

function firstPhoto(page: Page): string | null {
  for (const b of page.blocks) {
    if ((b.type === "hero" || b.type === "tekstFoto") && b.props.foto) return b.props.foto;
    if (b.type === "galerij" && b.props.fotos[0]) return b.props.fotos[0];
  }
  return null;
}

function htmlDoc(ctx: Ctx, page: Page, body: string, opts: RenderOptions, css: string): string {
  const url = `${opts.origin}${page.slug ? `${opts.root}${page.slug}` : homeHref(opts.root)}`;
  const photoId = firstPhoto(page);
  const photo = photoId ? ctx.media.get(photoId) : undefined;
  const ogImage = photo ? `${opts.origin}${opts.root}media/${photo.file}` : null;
  const title = page.seoTitel || `${page.titel} | ${ctx.bedrijf.naam}`;
  const initial = esc((ctx.bedrijf.naam.trim()[0] ?? "Z").toUpperCase());
  const favicon = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#111"/><text x="32" y="44" font-family="Arial" font-size="36" font-weight="700" text-anchor="middle" fill="#fff">${initial}</text></svg>`)}`;
  const styles = ctx.preview ? `<style>${css}</style>` : `<link rel="stylesheet" href="${esc(`${opts.root}assets/site.css${opts.version ? `?v=${opts.version}` : ""}`)}">`;
  const robots = opts.noindex || ctx.voorstel || page.id.startsWith("__") ? '<meta name="robots" content="noindex">' : "";
  // a proposal or an example says nothing to search engines about a business
  const business = page.slug === "" && !ctx.voorbeeld && !ctx.voorstel ? localBusiness(ctx.bedrijf, url, ogImage) : "";
  const naam = esc(ctx.bedrijf.naam);
  const officieel = ctx.voorstel?.officieel;
  const bar = ctx.voorstel
    ? `<div class="demo-bar">Ontwerpvoorstel van ZekerFlex voor ${naam}. Dit is niet de officiële website van ${naam}${officieel ? `; die staat op <a href="${esc(href(ctx, `https://${officieel}`))}" rel="noopener">${esc(officieel)}</a>` : ""}.</div>`
    : ctx.voorbeeld
      ? `<div class="demo-bar">Dit is een voorbeeldwebsite, gemaakt met de websitebouwer van ZekerFlex. ${naam} bestaat niet. <a href="${esc(ctx.preview ? "#" : `${ctx.origin}/werkgever/website/bouwer`)}">Maak je eigen website</a></div>`
      : "";
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="description" content="${esc(page.seoOmschrijving)}">${robots}<link rel="canonical" href="${esc(url)}"><meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(page.seoOmschrijving)}"><meta property="og:url" content="${esc(url)}">${ogImage ? `<meta property="og:image" content="${esc(ogImage)}">` : ""}<link rel="icon" href="${favicon}">${styles}${business}</head><body>${bar}${header(ctx, page)}<main id="inhoud">${body}</main>${footer(ctx)}${whatsappButton(ctx)}</body></html>`;
}

function context(site: RenderableSite, opts: RenderOptions): Ctx {
  const media = new Map(site.media.map((m) => [m.id, m]));
  return {
    root: opts.root,
    pages: site.pages,
    media,
    mediaSrc: opts.preview ? opts.preview.mediaUrl : (file) => `${opts.root}media/${file}`,
    preview: Boolean(opts.preview),
    bedrijf: site.bedrijf,
    voorbeeld: Boolean(site.voorbeeld),
    voorstel: site.voorstel ?? null,
    logo: site.theme.logo ? media.get(site.theme.logo) : undefined,
    origin: opts.origin,
  };
}

/** One of the site's own pages as a full HTML document. */
export function renderPage(site: RenderableSite, page: Page, opts: RenderOptions): string {
  const ctx = context(site, opts);
  return htmlDoc(ctx, page, page.blocks.map((b, i) => renderBlock(b, i, ctx)).join(""), opts, siteCss(site.theme));
}

const fixedPage = (id: string, slug: string, titel: string): Page => ({ id: `__${id}`, slug, titel, seoTitel: titel, seoOmschrijving: titel, blocks: [] });

/** The privacy statement, thank-you and not-found pages every site has. */
export function renderSystemPage(site: RenderableSite, kind: "privacy" | "bedankt" | "404", opts: RenderOptions): string {
  const ctx = context(site, opts);
  const c = site.bedrijf;
  const home = esc(ctx.preview ? "#" : homeHref(opts.root));
  const wrap = (inner: string) => `<section><div class="wrap narrow">${inner}</div></section>`;
  if (kind === "privacy") {
    const text = `${c.naam}${c.kvk ? ` (KVK ${c.kvk})` : ""} gaat zorgvuldig om met je gegevens.\n\nStuur je ons een bericht via het contactformulier, dan gebruiken we je naam, e-mailadres, telefoonnummer en bericht alleen om je te antwoorden. We bewaren ze niet langer dan nodig en delen ze met niemand, behalve met ZekerFlex, dat deze website voor ons host.\n\nDeze website gebruikt geen cookies en geen bezoekersvolgsystemen van anderen. Foto's en lettertypes komen van deze website zelf.\n\nWil je weten welke gegevens we van je hebben, of wil je ze laten verwijderen? Mail ons${c.email ? ` op ${c.email}` : ""}.`;
    return htmlDoc(ctx, fixedPage("privacy", "privacy", `Privacyverklaring | ${c.naam}`), wrap(`<h1>Privacyverklaring</h1>${paras(text)}`), opts, siteCss(site.theme));
  }
  if (kind === "bedankt") {
    return htmlDoc(ctx, fixedPage("bedankt", "bedankt", `Bedankt | ${c.naam}`), wrap(`<h1>Bedankt voor je bericht</h1>${paras("We hebben je bericht ontvangen en nemen zo snel mogelijk contact met je op.")}<p><a class="btn" href="${home}">Terug naar de website</a></p>`), opts, siteCss(site.theme));
  }
  return htmlDoc(ctx, fixedPage("404", "niet-gevonden", `Pagina niet gevonden | ${c.naam}`), wrap(`<h1>Deze pagina bestaat niet</h1>${paras("Misschien is hij verhuisd. Ga terug naar de homepagina.")}<p><a class="btn" href="${home}">Naar de homepagina</a></p>`), opts, siteCss(site.theme));
}

export function renderSitemap(site: RenderableSite, opts: RenderOptions): string {
  const urls = site.pages.map((p) => `${opts.origin}${p.slug ? `${opts.root}${p.slug}` : homeHref(opts.root)}`);
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${esc(u)}</loc></url>`).join("")}</urlset>`;
}

export function renderRobots(opts: RenderOptions): string {
  return opts.noindex ? "User-agent: *\nDisallow: /\n" : `User-agent: *\nAllow: /\nSitemap: ${opts.origin}${opts.root}sitemap.xml\n`;
}

/** Short description of a block for the builder's list. */
export function blockSummary(b: Block): string {
  const p = b.props as { kop?: string };
  return p.kop ? `${BLOCK_LABELS[b.type]}: ${p.kop}` : BLOCK_LABELS[b.type];
}
