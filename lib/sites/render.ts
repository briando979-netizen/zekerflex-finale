import { ldJson } from "@/lib/seo/json-ld";
import { belevingBlok, belevingCss, metKicker, paginaKop, type BelevingCtx } from "@/lib/sites/beleving-render";
import { diepteBlok, diepteCss } from "@/lib/sites/diepte-render";
import { functiesVoorBezoekers, functiesVoorJou, type Functie } from "@/lib/sites/wat-kan-deze-site";
import { BLOCK_LABELS, isHexColor, type Block, type Company, type Media, type Page, type SiteDoc, type SiteProposalMark, type SiteVacancy, type Theme, type Winkel } from "@/lib/sites/types";
import { winkelVan, zichtbareProducten, type BestelInvoer, type Bestelconcept } from "@/lib/sites/winkel";
import { prijzenExclBtw } from "@/lib/sites/winkel-btw";
import { nuInNL, reserveerBlokVan } from "@/lib/sites/reserveren";
import type { MandRegelInfo } from "@/lib/sites/mand";
import { extraBlokHtml, extraCss } from "@/lib/sites/extra-blokken-render";
import { burgerBlokHtml, burgerCss, heeftBurger } from "@/lib/sites/burger3d";
import type { WinkelFilter } from "@/lib/sites/winkel-filter";
import { gereserveerdBody, reserveerBlokHtml, reserveerCss, reserveerPaginaBody, type ReserveerCtx, type ReserveerStaat } from "@/lib/sites/reserveren-render";
import {
  besteldPaginaBody,
  bestelPaginaBody,
  mandPaginaBody,
  controlePaginaBody,
  productPaginaBody,
  renderProductenBlok,
  renderUitgelichtBlok,
  winkelCss,
  winkelPaginaBody,
  type BesteldInfo,
  type WinkelCtx,
} from "@/lib/sites/winkel-render";

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
export type RenderableSite = Pick<SiteDoc, "pages" | "media" | "theme" | "bedrijf" | "voorbeeld" | "voorstel" | "winkel" | "soort">;

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
  /** the company's open shifts, loaded live for a page with a vacatures block; absent = show an example */
  vacatures?: SiteVacancy[] | undefined;
  /** a "Chat met ons" link at the bottom right to the site's chat page …/_zf/chat (lib/sitechat/site-pagina.ts); no script */
  chat?: boolean | undefined;
  /** hoeveel artikelen in de winkelmand van deze bezoeker (lib/sites/mand.ts); absent = geen mandje in de kop */
  mandAantal?: number | undefined;
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

/** Raise when siteCss gains rules a published site needs (2: the shop; 3: two products per row on phones; 4: .vh for the invisible h1; 5: size/colour choices and stock; 6: order page on 320px; 7: the beleving style, 4 Nov 2026; 8: order-form headings inside their card; 9: beleving photo tiles, panel and hours card; 10: beleving page header; 11: the chat link and the chat page, 4 Nov 2026; 12: beleving photo tiles two by two on phones; 13: the "wat kan deze site" page; 14: a long name in the beleving header fits on a phone; 15: reserving a table; 16: the shopping cart, shop filters and a cart in the header; 17: the 3D burger, only on a site with one (after the style, so no style overrules it), 4 Nov 2026; 18: the builder's new blocks and block settings, 6 Nov 2026; 19: choosing shipping and payment at checkout, VAT rows and the transfer details with a payment QR code, 10 Nov 2026; 20: the 3D style, 11 Nov 2026; 21: its scroll hint on the left on phones, clear of the chat button; 22: the real burger from a photo, 11 Nov 2026). */
const CSS_REV = 22;

/**
 * The chat link (bottom right, above the WhatsApp button when there is one) and the chat page
 * …/_zf/chat (lib/sitechat/site-pagina.ts). The body gets room below so the link never covers
 * the last content (the order form's quantity fields on 320px).
 */
const CHAT_CSS = `
.zfchat{position:fixed;right:18px;bottom:18px;z-index:6;display:inline-flex;align-items:center;gap:8px;padding:12px 18px;border-radius:999px;background:var(--k);color:var(--k-t);font-weight:700;text-decoration:none;box-shadow:0 10px 28px rgba(0,0,0,.22)}.zfchat svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linejoin:round}
.wa+.zfchat{bottom:80px}body:has(.zfchat){padding-bottom:84px}body:has(.wa+.zfchat){padding-bottom:146px}
.zfc-pagina{background:var(--soft);padding-bottom:0}.zfc-kop{position:sticky;top:0;z-index:5;background:var(--k);color:var(--k-t);border:0}.zfc-balk{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:64px}
.zfc-terug{color:inherit;font-weight:600;text-decoration:none}.zfc-naam{margin:0;text-align:right;line-height:1.3}.zfc-naam span{display:block;font-size:.8rem;opacity:.9}
main.zfc.wrap{max-width:820px;padding-top:28px;padding-bottom:56px}.zfc-uitleg{color:var(--mute);font-size:.9rem}.zfc-log{list-style:none;margin:0 0 8px;padding:0;display:grid;gap:12px}
.zfc-b{max-width:85%;padding:12px 16px;border-radius:18px;background:#fff;border:1px solid var(--line)}.zfc-b p{margin:0;white-space:pre-line}
.zfc-gast{margin-left:auto;background:var(--k);color:var(--k-t);border-color:transparent}.zfc-medewerker{border:2px solid var(--k)}
.zfc-sys{max-width:100%;background:none;border:0;padding:0 8px;text-align:center;color:var(--mute);font-size:.88rem}
.zfc-wie{display:block;font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--mute);margin-bottom:4px}.zfc-gast .zfc-wie{color:inherit;opacity:.85}
.zfc-anker{margin:0;height:1px}.zfc-sug{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px}
.zfc-form{display:grid;gap:8px;background:#fff;border:1px solid var(--line);border-radius:var(--r);padding:14px}.zfc-form label{font-weight:600}.zfc-rij{margin:0}
.zfc-form textarea,.zfc-velden input,.zfc-velden select,.zfc-velden textarea{width:100%;font:inherit;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:#fff;color:var(--ink)}
.zfc-acties{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0}.zfc-acties form{margin:0}
.zfc-knop{display:inline-block;padding:9px 16px;border-radius:999px;border:1px solid var(--line);background:#fff;color:var(--ink);font:inherit;font-weight:600;font-size:.92rem;line-height:1.3;text-decoration:none;cursor:pointer}.zfc-knop:disabled{opacity:.6;cursor:default}
.zfc-melding{padding:10px 14px;border-radius:12px;background:#fde2e2;color:#8a1c1c;font-weight:600}.zfc-ok{padding:10px 14px;border-radius:12px;background:#dcfce7;color:#14532d;font-weight:600}
.zfc-inert{padding:12px 16px;border-radius:12px;background:#fff7e0;border:1px solid #f0d58a}
.zfc-afspraak{margin-top:8px;background:#fff;border:1px solid var(--line);border-radius:var(--r);padding:18px}.zfc-afspraak h2{font-size:1.3rem}.zfc-velden{display:grid;gap:12px}
.zfc-velden label{display:grid;gap:4px;font-weight:600;font-size:.95rem}.zfc-twee{display:grid;gap:12px;grid-template-columns:1fr 1fr}@media (max-width:520px){.zfc-twee{grid-template-columns:1fr}}
.zfc-velden .zfc-akkoord{display:flex;gap:10px;align-items:flex-start;font-weight:400}.zfc-velden .zfc-akkoord input{width:auto;margin-top:5px}`;

/** The stylesheet address of a published site, with the code revision as cache-buster (also for the chat page). */
export const stylesheetHref = (opts: Pick<RenderOptions, "root" | "version">) => `${opts.root}assets/site.css${opts.version ? `?v=${opts.version}.${CSS_REV}` : ""}`;

/** Pages every published site has besides its own (the shop's: lib/sites/winkel-render.ts). */
export const SYSTEM_PAGES = ["privacy", "bedankt", "winkel", "bestellen", "wat-kan-deze-site", "reserveren", "mand"];

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

// ---- premium: the ZekerFlex house style (like schwarzwald.zekerflex.com) ------

/**
 * The premium style's fonts (variable: Bricolage Grotesque 500–700 for headings,
 * Instrument Sans 400–600 for text), served by the site itself from
 * assets/fonts/ (lib/sites/serve.ts), so nothing comes from elsewhere.
 */
export const SITE_FONT_FILES = [
  "bricolage-grotesque-latin.4fd48b2c.woff2",
  "bricolage-grotesque-latin-ext.a22c997a.woff2",
  "instrument-sans-latin.6219bc4b.woff2",
  "instrument-sans-latin-ext.21fac8da.woff2",
] as const;
const LATIN = "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
const LATIN_EXT = "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C4,U+2113,U+2C60-2C7F,U+A720-A7FF";
const DISPLAY = `"Bricolage Grotesque", ${SANS}`;
const TEXT = `"Instrument Sans", ${SANS}`;
export const CREAM = "#FFF6EA";
export const SAND = "#F4E9DA";
const SUN = "#FFD23F";

const toHex = (rgb: number[]) => `#${rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;
/** `t` of the way from colour `a` to colour `b`. */
const mix = (a: string, b: string, t: number) => {
  const to = hexToRgb(b);
  return toHex(hexToRgb(a).map((v, i) => v + (to[i]! - v) * t));
};
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
/** The accent, darkened just enough for small text and links on sand and cream (WCAG AA). */
export function darkAccent(accent: string): string {
  for (let t = 0; t <= 1; t += 0.05) {
    const c = mix(accent, "#000000", t);
    if (contrast(c, SAND) >= 4.6) return c;
  }
  return "#000000";
}

/** Dark tones from the site's own colour: night (header, opening photo, footer), forest and moss. */
export function premiumTokens(kleur: string, accent: string): { night: string; forest: string; moss: string; accentDark: string } {
  return { night: mix(kleur, "#000000", 0.8), forest: mix(kleur, "#000000", 0.62), moss: mix(kleur, "#000000", 0.4), accentDark: darkAccent(accent) };
}

function premiumCss(kleur: string, accent: string, fontBase: string): string {
  const t = premiumTokens(kleur, accent);
  const [r, g, b] = hexToRgb(t.night);
  const night = (o: number) => `rgba(${r},${g},${b},${o})`;
  const face = (family: string, weight: string, file: string, range: string) =>
    `@font-face{font-family:"${family}";font-style:normal;font-weight:${weight};font-display:swap;src:url(${fontBase}${file}) format("woff2");unicode-range:${range}}`;
  const [dl, dx, tl, tx] = SITE_FONT_FILES;
  return `${face("Bricolage Grotesque", "500 700", dl, LATIN)}${face("Bricolage Grotesque", "500 700", dx, LATIN_EXT)}${face("Instrument Sans", "400 600", tl, LATIN)}${face("Instrument Sans", "400 600", tx, LATIN_EXT)}
:root{--night:${t.night};--forest:${t.forest};--moss:${t.moss};--sun:${SUN};--cream:${CREAM};--sand:${SAND};--a-d:${t.accentDark};--ink:${t.night};--mute:#5C6B62;--line:rgba(10,18,14,.12);--soft:var(--sand)}
body{background:var(--cream);font-family:${TEXT};line-height:1.7}a{color:var(--a-d)}
h1,h2,h3,.logo{font-family:${DISPLAY};font-weight:700;letter-spacing:-.03em}h1{font-size:clamp(2.6rem,7vw,6rem);line-height:.98}h2{font-size:clamp(2rem,4.4vw,3.5rem);line-height:1.04}h3{font-size:1.3rem;letter-spacing:-.015em}
.wrap{max-width:1280px;padding:0 24px}@media (min-width:640px){.wrap{padding:0 32px}}
.topbar{background:var(--sun);color:var(--night);text-align:center;font-size:.875rem;font-weight:600;line-height:1.5;padding:8px 20px}.topbar a{color:var(--night)}
header{background:var(--night);color:var(--cream);border-bottom:0}.bar{min-height:72px}.logo{color:var(--cream);font-size:1.35rem}.logo img{max-height:52px}
nav ul{gap:2px}nav a{color:${"rgba(255,246,234,.85)"};font-size:.92rem;padding:8px 14px}nav a:hover,nav a[aria-current]{background:rgba(255,255,255,.1);color:var(--cream)}
.bar.prem{justify-content:flex-start}.bar.prem>nav.desk{margin-left:auto}.acts{display:flex;align-items:center;gap:8px}@media (max-width:760px){.acts{margin-left:auto}}
.cta-top{padding:11px 20px;font-size:.92rem}@media (max-width:480px){.cta-top{display:none}}
.menu summary{border-color:rgba(255,255,255,.22);color:var(--cream)}@media (max-width:760px){.menu ul{background:#fff;border:0}.menu nav a{color:var(--night)}.menu nav a:hover,.menu nav a[aria-current]{background:var(--sand);color:var(--night)}}
section{padding:96px 0}@media (max-width:760px){section{padding:64px 0}}section.alt{background:var(--sand)}
.btn{border-radius:999px;padding:15px 28px;font-weight:700}.btn:hover{filter:brightness(1.05)}
.hero{min-height:min(88vh,860px);display:flex;align-items:flex-end;padding:160px 0 96px;background:var(--night);color:var(--cream)}.hero .wrap{z-index:1;width:100%}.hero img{opacity:1}
.hero.photo::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,${night(0.2)} 0%,${night(0.45)} 45%,${night(0.92)} 100%)}.hero h1{color:#fff;max-width:16ch}.hero p{font-size:1.2rem;max-width:620px;opacity:.92}
.eyebrow{margin:0 0 18px;font-size:.78rem;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--sun);opacity:1}
@media (max-width:760px){.hero{min-height:76vh;padding:128px 0 64px}}
.cards{gap:24px}.card{background:#fff;border:0;border-radius:28px;padding:32px;box-shadow:0 1px 2px rgba(10,18,14,.05),0 14px 34px rgba(10,18,14,.08)}.card h3{color:var(--night)}section.alt .card{background:#fff}.card.photo .body{padding:26px 32px 32px}
.steps li{border:0;border-radius:28px;padding:32px;box-shadow:0 1px 2px rgba(10,18,14,.05),0 14px 34px rgba(10,18,14,.08)}.steps li::before{width:52px;height:52px;background:var(--night);color:var(--sun);font:700 1.35rem/1 ${DISPLAY}}
.split{gap:56px}.split img,.gallery img{border-radius:28px}.stars{color:var(--a-d)}details.q{border-color:var(--line)}details.q summary::after{color:var(--a-d)}.hours td{border-color:var(--line)}
.band{background:var(--night);color:var(--cream);padding:112px 0}.band h2{color:#fff;max-width:18ch;margin-left:auto;margin-right:auto}
form.contact input,form.contact textarea{border-radius:14px;border-color:rgba(10,18,14,.2)}
footer{background:var(--night);color:rgba(255,246,234,.8);padding:72px 0 32px}footer a{color:var(--cream)}footer h3{font:700 .78rem/1.4 ${TEXT};letter-spacing:.18em;text-transform:uppercase;color:var(--sun);margin:0 0 14px}footer p{margin:0 0 6px}footer small{color:rgba(255,246,234,.6)}
footer .cols{grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:40px}footer ul{list-style:none;margin:0;padding:0;display:grid;gap:6px}.foot-hours{display:grid;grid-template-columns:auto auto;gap:4px 16px;margin:0}.foot-hours dd{margin:0;font-weight:600;color:var(--cream)}
:focus-visible{outline-color:var(--a-d)}header :focus-visible,.hero :focus-visible,.band :focus-visible,footer :focus-visible{outline-color:var(--sun)}.topbar :focus-visible{outline-color:var(--night)}`;
}

/**
 * Beleving on top of premium: text on the accent is night (on a light accent, like their orange) or cream;
 * a highlighted word on night is the accent when it reads well there (their orange does), else sun.
 */
function belevingStijl(kleur: string, accent: string): string {
  const t = premiumTokens(kleur, accent);
  return belevingCss(t, accent, textOn(accent) === "#ffffff" ? CREAM : t.night, DISPLAY, TEXT, contrast(accent, t.night) >= 4.5 ? accent : SUN);
}

/** 3D on top of beleving (lib/sites/diepte-render.ts): the depth, the flight through the photos and what moves while scrolling. */
function diepteStijl(kleur: string, accent: string): string {
  return diepteCss(premiumTokens(kleur, accent), accent, DISPLAY, TEXT);
}

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
.cards{gap:48px 40px}.card{background:transparent;border:0;border-top:1px solid var(--line);border-radius:0;padding:28px 0 0}.card h3{color:var(--ink)}section.alt .card{border-color:#ddd6ca}.card.photo{border-top:0}.card.photo .body{padding:22px 0 0}
.split{gap:64px}.split img{border-radius:0;aspect-ratio:4/5}.gallery{gap:8px}.gallery img{border-radius:0}.stars{letter-spacing:4px}
.band{background:#151412;color:#f3eee6}.band p{opacity:.85}form.contact input,form.contact textarea{border-radius:0;border-color:#d8d2c7}.hours td{padding:14px 0}footer{background:#121110}`;
}

/**
 * The stylesheet. `fontBase` is where the premium fonts are: next to the
 * stylesheet on a published site (assets/site.css → assets/fonts/), the app's
 * own /fonts/ for the inline CSS of the builder's preview.
 */
export function siteCss(theme: Theme, fontBase = "fonts/", metBurger = false): string {
  const kleur = isHexColor(theme.kleur) ? theme.kleur : "#0E5C4A";
  const accent = isHexColor(theme.accent) ? theme.accent : "#F2B544";
  const f = FONTS[theme.lettertype] ?? FONTS.modern;
  const r = theme.hoeken === "strak" ? "4px" : "16px";
  // beleving (lib/sites/beleving-render.ts) is premium met de opbouw van schwarzwald.zekerflex.com erbovenop
  // diepte ("3D", lib/sites/diepte-render.ts) is beleving met een echte 3D-ruimte erbij
  const diepte = theme.stijl === "diepte";
  const beleving = theme.stijl === "beleving" || diepte;
  const premium = theme.stijl === "premium" || beleving;
  const luxe = theme.stijl === "luxe" ? `\n${luxeCss(theme.lettertype === "klassiek")}` : premium ? `\n${premiumCss(kleur, accent, fontBase)}${beleving ? belevingStijl(kleur, accent) : ""}${diepte ? diepteStijl(kleur, accent) : ""}` : "";
  // de winkel (lib/sites/winkel-render.ts) staat tussen de basis en de stijl, zodat luxe/premium hem kunnen bijstellen
  const winkel = `\n${winkelCss(premium)}\n${reserveerCss(premium)}`;
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
.vh{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.demo-bar{display:block;background:#16191d;color:#fff;text-align:center;font-size:.9rem;line-height:1.5;padding:10px 20px}.demo-bar a{color:#fff;font-weight:700}form.contact :disabled{opacity:.6;cursor:not-allowed}
.logo img{display:block;max-height:48px;width:auto}.socials{display:flex;flex-wrap:wrap;gap:6px 16px}
ul.cards{list-style:none;margin:0;padding:0}.probeer{margin:14px 0 0}.probeer a{font-weight:700}
.vac{display:flex;flex-direction:column;gap:6px}.vac .meta{color:var(--mute);font-size:.95rem}.vac .btn{padding:10px 18px;font-size:.9rem}
.wa{position:fixed;right:18px;bottom:18px;z-index:6;display:inline-flex;align-items:center;gap:8px;padding:12px 18px;border-radius:999px;background:#1c7c4b;color:#fff;font-weight:700;text-decoration:none;box-shadow:0 10px 28px rgba(0,0,0,.22)}.wa svg{width:20px;height:20px;fill:currentColor}
.card.photo{padding:0;overflow:hidden}.card.photo img{width:100%;aspect-ratio:4/3;object-fit:cover}.card.photo .body{padding:22px 24px 24px}
.steps,.usps{list-style:none;margin:0;padding:0;display:grid;gap:20px;grid-template-columns:repeat(auto-fit,minmax(230px,1fr))}.steps{counter-reset:stap}.steps h3,.usps h3{margin:0 0 .35em}.steps p:last-child,.usps p:last-child{margin:0}
.steps li{counter-increment:stap;background:#fff;border:1px solid var(--line);border-radius:var(--r);padding:24px}section.alt .steps li{border-color:transparent}.steps li::before{content:counter(stap);display:grid;place-items:center;width:40px;height:40px;margin:0 0 14px;border-radius:999px;background:var(--k);color:var(--k-t);font-weight:700}
.usps li{position:relative;padding:2px 0 0 44px}.usps li::before{content:"✓";position:absolute;left:0;top:0;display:grid;place-items:center;width:30px;height:30px;border-radius:999px;background:var(--a);color:var(--a-t);font-weight:700}${CHAT_CSS}
${extraCss()}${winkel}${luxe}${metBurger ? `\n${burgerCss()}` : ""}`;
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
  /** a webshop (SiteDoc.soort): on an example (lib/sites/winkel-voorbeelden.ts) the banner and the tour speak of a webshop */
  webshop: boolean;
  /** a design proposal to a company: the same, with a banner that it is not their official site */
  voorstel: SiteProposalMark | null;
  /** the photo shown as logo in the header */
  logo: Media | undefined;
  /** live open shifts for a vacatures block; undefined in the builder, an example or a proposal */
  vacatures: SiteVacancy[] | undefined;
  /** where "make your own website" points, for the example banner */
  origin: string;
  /** the premium house style: a label above the opening heading, a bar with phone/e-mail, a button in the header, a full footer */
  premium: boolean;
  /** the "beleving" style: premium laid out like schwarzwald.zekerflex.com (lib/sites/beleving-render.ts); also true for 3D */
  beleving: boolean;
  /** the "3D" style (stijl "diepte"): beleving with real 3D (lib/sites/diepte-render.ts) */
  diepte: boolean;
  /** the site's shop (an empty one when it has none) */
  winkel: Winkel;
  /** items in this visitor's cart; undefined = no cart link in the header */
  mandAantal: number | undefined;
}

/** What the shop's rendering (lib/sites/winkel-render.ts) needs from a page context. */
function winkelCtx(ctx: Ctx): WinkelCtx {
  return {
    root: ctx.root,
    preview: ctx.preview,
    inert: ctx.voorbeeld || Boolean(ctx.voorstel),
    premium: ctx.premium,
    bedrijfNaam: ctx.bedrijf.naam,
    bedrijfAdres: [ctx.bedrijf.straat.trim(), `${ctx.bedrijf.postcode.trim()} ${ctx.bedrijf.plaats.trim()}`.trim()].filter(Boolean).join(", "),
    exclBtw: prijzenExclBtw(ctx.winkel),
    esc,
    paras,
    img: (id, sizes, eager) => img(ctx, id, sizes, eager),
    href: (raw) => href(ctx, raw),
  };
}

/** What reserving a table (lib/sites/reserveren-render.ts) needs from a page context. */
function reserveerCtx(ctx: Ctx): ReserveerCtx {
  return { root: ctx.root, preview: ctx.preview, inert: ctx.voorbeeld || Boolean(ctx.voorstel), bedrijf: ctx.bedrijf, esc, paras, href: (raw) => href(ctx, raw) };
}

/** `alt` overrides the photo's own description ("" for a photo that is only decoration). */
function img(ctx: Ctx, id: string | null, sizes: string, eager = false, alt?: string): string {
  const m = id ? ctx.media.get(id) : undefined;
  if (!m) return "";
  // a photo of up to 4K with a 1600 px copy: the browser picks by screen size and sharpness (Media.klein)
  const srcset = m.klein ? ` srcset="${esc(`${ctx.mediaSrc(m.file.replace(/\.webp$/, "-k.webp"))} ${m.klein.width}w, ${ctx.mediaSrc(m.file)} ${m.width}w`)}"` : "";
  return `<img src="${esc(ctx.mediaSrc(m.file))}"${srcset} alt="${esc(alt ?? m.alt)}" width="${m.width}" height="${m.height}" sizes="${esc(sizes)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
}

const href = (ctx: Ctx, raw: string) => (ctx.preview ? "#" : safeHref(raw, ctx.root, ctx.pages));

/** The stars of a review; none for 0 (a customer's story from their own site, without a made-up score). */
export function starsRow(sterren: number): string {
  if (!(sterren >= 1)) return "";
  const n = Math.min(5, Math.round(sterren));
  return `<div class="stars" role="img" aria-label="${n} van de 5 sterren">${"★".repeat(n)}${"☆".repeat(5 - n)}</div>`;
}

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
      const label = ctx.premium ? [ctx.bedrijf.naam, ctx.bedrijf.plaats].filter(Boolean).join(" · ") : "";
      return `<section class="hero${pic ? " photo" : ""}">${pic}<div class="wrap">${label ? `<p class="eyebrow">${esc(label)}</p>` : ""}<h1>${esc(p.kop)}</h1>${paras(p.tekst)}${p.knop ? `<p><a class="btn" href="${esc(href(ctx, p.knopLink))}">${esc(p.knop)}</a></p>` : ""}</div></section>`;
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
      return `<section${alt}><div class="wrap"><h2>${esc(b.props.kop)}</h2><div class="cards">${b.props.items
        .map((it) => {
          // a card with its own photo on top ("aanbodkaart"); without one, as before
          const pic = img(ctx, it.foto ?? null, "(min-width: 760px) 33vw, 100vw");
          return pic ? `<div class="card photo">${pic}<div class="body"><h3>${esc(it.titel)}</h3>${paras(it.tekst)}</div></div>` : `<div class="card"><h3>${esc(it.titel)}</h3>${paras(it.tekst)}</div>`;
        })
        .join("")}</div></div></section>`;
    // role="list": without list bullets Safari would otherwise stop announcing these as a list
    case "stappen":
      return `<section${alt}><div class="wrap"><h2>${esc(b.props.kop)}</h2><ol class="steps" role="list">${b.props.items.map((it) => `<li><h3>${esc(it.titel)}</h3>${paras(it.tekst)}</li>`).join("")}</ol></div></section>`;
    case "usps":
      return `<section${alt}><div class="wrap"><h2>${esc(b.props.kop)}</h2><ul class="usps" role="list">${b.props.items.map((it) => `<li><h3>${esc(it.titel)}</h3>${paras(it.tekst)}</li>`).join("")}</ul></div></section>`;
    case "galerij": {
      const pics = b.props.fotos.map((f) => img(ctx, f, "(min-width: 760px) 33vw, 100vw")).filter(Boolean);
      if (pics.length === 0) return "";
      return `<section${alt}><div class="wrap"><h2>${esc(b.props.kop)}</h2><div class="${galleryClass(pics.length)}">${pics.join("")}</div></div></section>`;
    }
    case "reviews":
      return `<section${alt}><div class="wrap"><h2>${esc(b.props.kop)}</h2><div class="cards">${b.props.items
        .map((r) => {
          return `<figure class="card">${starsRow(r.sterren)}<blockquote>${paras(r.tekst)}</blockquote><figcaption class="who">${esc(r.naam)}</figcaption></figure>`;
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
    case "vacatures": {
      const p = b.props;
      const live = ctx.vacatures;
      const list = (live ?? exampleVacancies()).slice(0, Math.max(1, Math.min(12, p.aantal)));
      const cards = list
        .map(
          (v) =>
            `<div class="card vac"><h3>${esc(v.titel)}</h3><p class="meta">${esc(vacancyWhen(v))}<br>${esc(v.plaats)} · ${esc(euroPerHour(v.uurloonCents))}</p><p style="margin:0"><a class="btn" href="${esc(live ? href(ctx, v.url) : "#")}"${live ? ' rel="noopener"' : ""}>Reageer via ZekerFlex</a></p></div>`,
        )
        .join("");
      const body = live && live.length === 0
        ? `<p class="small">Er staan nu geen diensten open. Kijk later nog eens, of <a href="${esc(href(ctx, "contact"))}">neem contact op</a>.</p>`
        : `<div class="cards">${cards}</div>${live ? "" : `<p class="small">Voorbeeld: op je website staan hier vanzelf je open diensten op ZekerFlex.</p>`}`;
      return `<section${alt}><div class="wrap"><h2>${esc(p.kop)}</h2>${paras(p.tekst)}${body}</div></section>`;
    }
    case "producten":
      return renderProductenBlok(winkelCtx(ctx), ctx.winkel, b.props, alt);
    case "uitgelicht":
      return renderUitgelichtBlok(winkelCtx(ctx), ctx.winkel, b.props, alt);
    case "reserveren":
      return reserveerBlokHtml(reserveerCtx(ctx), b.props, alt, nuInNL());
    case "burger3d":
      // the real burger's photos come from the site itself (assets/burger/, lib/sites/serve.ts); the builder's preview takes the app's own
      return burgerBlokHtml(b.props, { esc, paras, href: (raw) => href(ctx, raw), asset: (bestand) => (ctx.preview ? `/sites/burger/${bestand}` : `${ctx.root}assets/burger/${bestand}`) }, b.id);
    default:
      return extraBlokHtml(b, { esc, paras, img: (id, sizes, eager, alt) => img(ctx, id, sizes, eager, alt), href: (raw) => href(ctx, raw), bedrijf: ctx.bedrijf }, alt) ?? "";
  }
}

/** Shown in the builder, an example site or a proposal, where there are no real shifts: always a few days ahead. */
function exampleVacancies(now = Date.now()): SiteVacancy[] {
  const at = (days: number, hourUtc: number, minute = 0) => {
    const d = new Date(now + days * 86_400_000);
    d.setUTCHours(hourUtc, minute, 0, 0);
    return d.toISOString();
  };
  return [
    { id: "voorbeeld-1", titel: "Medewerker bediening (voorbeeld)", start: at(3, 16), eind: at(3, 22), plaats: "Zwolle", uurloonCents: 1650, url: "#" },
    { id: "voorbeeld-2", titel: "Magazijnmedewerker (voorbeeld)", start: at(5, 6), eind: at(5, 14, 30), plaats: "Zwolle", uurloonCents: 1525, url: "#" },
  ];
}

const euroPerHour = (cents: number) => `€ ${(cents / 100).toFixed(2).replace(".", ",")} per uur`;

/** "za 14 nov · 17:00 – 23:00" in Dutch time, whatever the server's clock is. */
export function vacancyWhen(v: Pick<SiteVacancy, "start" | "eind">): string {
  const tz = { timeZone: "Europe/Amsterdam" } as const;
  const day = new Date(v.start).toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short", ...tz });
  const time = (iso: string) => new Date(iso).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", ...tz });
  return `${day} · ${time(v.start)} – ${time(v.eind)}`;
}

/** The pages in the menu and footer: all, except those the company took out of the menu. */
export const menuPaginas = (pages: Page[]): Page[] => pages.filter((p) => p.menu !== false);
/** The name of a page in the menu. */
export const menuNaam = (p: Pick<Page, "titel" | "menuLabel">): string => p.menuLabel?.trim() || p.titel;

function header(ctx: Ctx, current: Page): string {
  const links = menuPaginas(ctx.pages)
    .map((p) => `<li><a href="${esc(ctx.preview ? "#" : safeHref(p.slug || "home", ctx.root, ctx.pages))}"${p.id === current.id ? ' aria-current="page"' : ""}>${esc(menuNaam(p))}</a></li>`)
    .join("");
  const logo = ctx.logo
    ? `<img src="${esc(ctx.mediaSrc(ctx.logo.file))}" alt="${esc(ctx.bedrijf.naam)}" width="${ctx.logo.width}" height="${ctx.logo.height}" fetchpriority="high" decoding="async">`
    : esc(ctx.bedrijf.naam);
  const menu = `<details class="menu"><summary>Menu</summary><nav aria-label="Menu"><ul>${links}</ul></nav></details>`;
  const mand = mandLink(ctx);
  if (ctx.premium) {
    // beleving: no bar with phone and e-mail above the header, as on schwarzwald.zekerflex.com (the phone is in the opening and the closing band)
    return `${ctx.beleving ? "" : topBar(ctx)}<header><div class="wrap bar prem"><a class="logo" href="${esc(ctx.preview ? "#" : homeHref(ctx.root))}">${logo}</a><nav class="desk" aria-label="Hoofdmenu"><ul>${links}</ul></nav><div class="acts">${mand}${headerButton(ctx, current)}${menu}</div></div></header>`;
  }
  return `<header><div class="wrap bar"><a class="logo" href="${esc(ctx.preview ? "#" : homeHref(ctx.root))}">${logo}</a><nav class="desk" aria-label="Hoofdmenu"><ul>${links}</ul></nav>${mand ? `<div class="acts">${mand}${menu}</div>` : menu}</div></header>`;
}

/** The cart in the header of a site with a shop (lib/sites/mand.ts): a plain link with the number of items. */
function mandLink(ctx: Ctx): string {
  if (ctx.mandAantal === undefined) return "";
  const n = ctx.mandAantal;
  const label = n === 1 ? "1 artikel" : `${n} artikelen`;
  return `<a class="mandlink" href="${esc(ctx.preview ? "#" : `${ctx.root}mand`)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 7h12l-1 13H7L6 7z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg><span class="mtekst">Winkelmand</span>${n ? `<b>${n}</b>` : ""}<span class="vh">, ${label}</span></a>`;
}

const telHref = (raw: string) => `tel:${raw.replace(/[^\d+]/g, "")}`;

/** Premium: the bar above the header, with the phone number and e-mail address. */
function topBar(ctx: Ctx): string {
  const c = ctx.bedrijf;
  const parts = [
    c.telefoon && `Bel ons: <a href="${esc(href(ctx, telHref(c.telefoon)))}">${esc(c.telefoon)}</a>`,
    c.email && `<a href="${esc(href(ctx, `mailto:${c.email}`))}">${esc(c.email)}</a>`,
  ].filter(Boolean);
  return parts.length ? `<div class="topbar">${parts.join(" · ")}</div>` : "";
}

/** Premium: the round button in the header, to the contact form, or the phone number when there is none. */
function headerButton(ctx: Ctx, current: Page): string {
  // a restaurant that takes reservations: the button goes straight to the free times
  if (reserveerBlokVan(ctx.pages)) return `<a class="btn cta-top" href="${esc(href(ctx, "reserveren"))}">Reserveren</a>`;
  const withForm = ctx.pages.find((p) => p.blocks.some((b) => b.type === "contact"));
  const target = withForm ? (withForm.id === current.id ? "#contact" : withForm.slug || "home") : ctx.bedrijf.telefoon ? telHref(ctx.bedrijf.telefoon) : "";
  if (!target) return "";
  return `<a class="btn cta-top" href="${esc(href(ctx, target))}">${withForm ? "Contact" : "Bel ons"}</a>`;
}

function socialLinks(ctx: Ctx): string[] {
  return (ctx.bedrijf.socials ?? [])
    .map((u) => [href(ctx, u), u] as const)
    .filter(([h]) => ctx.preview || h !== "#")
    .map(([h, u]) => `<a href="${esc(h)}" rel="noopener me">${esc(socialName(u))}</a>`);
}

/** Premium: address, opening hours (from the first opening-hours block), the menu and contact, in up to four columns. */
function premiumFooter(ctx: Ctx): string {
  const c = ctx.bedrijf;
  const address = [c.straat, [c.postcode, c.plaats].filter(Boolean).join(" ")].filter(Boolean);
  const hours = ctx.pages.flatMap((p) => p.blocks).find((b): b is Extract<Block, { type: "openingstijden" }> => b.type === "openingstijden");
  const menu = menuPaginas(ctx.pages).map((p) => `<li><a href="${esc(ctx.preview ? "#" : safeHref(p.slug || "home", ctx.root, ctx.pages))}">${esc(menuNaam(p))}</a></li>`).join("");
  const socials = socialLinks(ctx);
  const contact = [
    c.telefoon && `<p><a href="${esc(href(ctx, telHref(c.telefoon)))}">${esc(c.telefoon)}</a></p>`,
    c.email && `<p><a href="${esc(href(ctx, `mailto:${c.email}`))}">${esc(c.email)}</a></p>`,
    socials.length && `<p class="socials">${socials.join("")}</p>`,
  ].filter(Boolean);
  // beleving: the logo on top of the first column, as on schwarzwald.zekerflex.com
  const flogo = ctx.beleving && ctx.logo ? `<img class="flogo" src="${esc(ctx.mediaSrc(ctx.logo.file))}" alt="" width="${ctx.logo.width}" height="${ctx.logo.height}" loading="lazy" decoding="async">` : "";
  const cols = [
    `<div>${flogo}<h3>${esc(c.naam)}</h3>${address.length ? `<p>${address.map(esc).join("<br>")}</p>` : ""}${c.kvk ? `<p>KVK ${esc(c.kvk)}</p>` : ""}</div>`,
    hours?.props.regels.length ? `<div><h3>${esc(hours.props.kop || "Openingstijden")}</h3><dl class="foot-hours">${hours.props.regels.map((r) => `<dt>${esc(r.dag)}</dt><dd>${esc(r.tijd)}</dd>`).join("")}</dl></div>` : "",
    `<div><h3>Menu</h3><ul>${menu}</ul></div>`,
    contact.length ? `<div><h3>Contact</h3>${contact.join("")}</div>` : "",
  ].filter(Boolean);
  return `<footer><div class="wrap"><div class="cols">${cols.join("")}</div><small>© ${new Date().getFullYear()} ${esc(c.naam)} · <a href="${esc(href(ctx, "privacy"))}">Privacyverklaring</a> · Website gemaakt met <a href="https://zekerflex.com" rel="noopener">ZekerFlex</a></small></div></footer>`;
}

function footer(ctx: Ctx): string {
  if (ctx.premium) return premiumFooter(ctx);
  const c = ctx.bedrijf;
  const address = [c.straat, [c.postcode, c.plaats].filter(Boolean).join(" ")].filter(Boolean);
  const socials = socialLinks(ctx);
  return `<footer><div class="wrap"><div class="cols"><div><strong>${esc(c.naam)}</strong>${address.length ? `<p>${address.map(esc).join("<br>")}</p>` : ""}</div><div>${c.telefoon ? `<p>${esc(c.telefoon)}</p>` : ""}${c.email ? `<p><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></p>` : ""}${socials.length ? `<p class="socials">${socials.join("")}</p>` : ""}</div><div>${c.kvk ? `<p>KVK ${esc(c.kvk)}</p>` : ""}<p><a href="${esc(href(ctx, "privacy"))}">Privacyverklaring</a></p></div></div><small>© ${new Date().getFullYear()} ${esc(c.naam)} · Website gemaakt met <a href="https://zekerflex.com" rel="noopener">ZekerFlex</a></small></div></footer>`;
}

/** A WhatsApp button that stays in the corner, when the company has a mobile number for it. */
function whatsappButton(ctx: Ctx): string {
  const wa = ctx.bedrijf.whatsapp ? waNumber(ctx.bedrijf.whatsapp) : null;
  if (!wa) return "";
  return `<a class="wa" href="${esc(href(ctx, `https://wa.me/${wa}`))}" rel="noopener"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3C7 3 3 6.6 3 11c0 2.2 1 4.2 2.7 5.6L5 21l4.3-2.3c.9.2 1.8.3 2.7.3 5 0 9-3.6 9-8s-4-8-9-8z"/></svg>WhatsApp</a>`;
}

/** "Chat met ons" bottom right: a plain link to the site's chat page, no script (lib/sitechat/site-pagina.ts). */
function chatLink(ctx: Ctx): string {
  return `<a class="zfchat" href="${esc(ctx.preview ? "#" : `${ctx.root}_zf/chat`)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H8l-4 4V5z"/></svg>Chat met ons</a>`;
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

function htmlDoc(ctx: Ctx, page: Page, body: string, opts: RenderOptions, css: string, foto?: string | null): string {
  const url = `${opts.origin}${page.slug ? `${opts.root}${page.slug}` : homeHref(opts.root)}`;
  // a product page shares its own photo; other pages the first photo on them
  const photoId = foto ?? firstPhoto(page);
  // no photo on the page: the logo is still a better preview in WhatsApp or LinkedIn than none
  const photo = (photoId ? ctx.media.get(photoId) : undefined) ?? ctx.logo;
  const ogImage = photo ? `${opts.origin}${opts.root}media/${photo.file}` : null;
  const title = page.seoTitel || `${page.titel} | ${ctx.bedrijf.naam}`;
  const initial = esc((ctx.bedrijf.naam.trim()[0] ?? "Z").toUpperCase());
  const favicon = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#111"/><text x="32" y="44" font-family="Arial" font-size="36" font-weight="700" text-anchor="middle" fill="#fff">${initial}</text></svg>`)}`;
  // CSS_REV: the stylesheet is cached for a year per build; a new revision of the code (the shop's styles) gets a new address
  const styles = ctx.preview ? `<style>${css}</style>` : `<link rel="stylesheet" href="${esc(stylesheetHref(opts))}">`;
  const robots = opts.noindex || ctx.voorstel || page.id.startsWith("__") ? '<meta name="robots" content="noindex">' : "";
  // a proposal or an example says nothing to search engines about a business
  const business = page.slug === "" && !ctx.voorbeeld && !ctx.voorstel ? localBusiness(ctx.bedrijf, url, ogImage) : "";
  const naam = esc(ctx.bedrijf.naam);
  const officieel = ctx.voorstel?.officieel;
  // een aside met een naam: alle inhoud hoort in een landmark (toegankelijkheid)
  // like schwarzwald.zekerflex.com: what it is, then "what this site can do" (…/wat-kan-deze-site) and the way out
  const tour = `<a href="${esc(href(ctx, "wat-kan-deze-site"))}">Bekijk wat deze site kan</a>`;
  const bar = ctx.voorstel
    ? `<aside class="demo-bar" aria-label="Over deze website">Ontwerpvoorstel van ZekerFlex voor ${naam}. Dit is niet de officiële website van ${naam}. ${tour}${officieel ? ` · <a href="${esc(href(ctx, `https://${officieel}`))}" rel="noopener">Naar de huidige site</a>` : ""}</aside>`
    : ctx.voorbeeld
      ? ctx.webshop
        ? `<aside class="demo-bar" aria-label="Over deze webshop">Dit is een voorbeeldwebshop, gemaakt met Webshop openen van ZekerFlex. ${naam} bestaat niet: je kunt alles proberen, maar er wordt niets besteld. ${tour} · <a href="${esc(ctx.preview ? "#" : `${ctx.origin}/aanbod/webshop`)}">Open je eigen webshop</a></aside>`
        : `<aside class="demo-bar" aria-label="Over deze website">Dit is een voorbeeldwebsite, gemaakt met de websitebouwer van ZekerFlex. ${naam} bestaat niet. ${tour} · <a href="${esc(ctx.preview ? "#" : `${ctx.origin}/werkgever/website/bouwer`)}">Maak je eigen website</a></aside>`
      : "";
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="description" content="${esc(page.seoOmschrijving)}">${robots}<link rel="canonical" href="${esc(url)}"><meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(page.seoOmschrijving)}"><meta property="og:url" content="${esc(url)}">${ogImage ? `<meta property="og:image" content="${esc(ogImage)}">` : ""}<link rel="icon" href="${favicon}">${styles}${business}</head><body><a class="skip" href="#inhoud">Naar de inhoud</a>${bar}${header(ctx, page)}<main id="inhoud">${body}</main>${footer(ctx)}${whatsappButton(ctx)}${opts.chat ? chatLink(ctx) : ""}</body></html>`;
}

/** A page without its hidden blocks (a hidden block is off the page, not deleted). */
const zonderVerborgen = (p: Page): Page => (p.blocks.some((b) => b.verborgen) ? { ...p, blocks: p.blocks.filter((b) => !b.verborgen) } : p);

/** Room, background and alignment the company chose for a block: a wrapper only when one is set, so the default output stays as it was. */
function metBlokstijl(b: Block, html: string): string {
  if (!html) return html;
  const klassen = [b.ruimte && b.ruimte !== "normaal" && `zf-r-${b.ruimte}`, b.achtergrond && b.achtergrond !== "geen" && `zf-bg-${b.achtergrond}`, b.uitlijning && b.uitlijning !== "links" && `zf-u-${b.uitlijning}`].filter(Boolean);
  return klassen.length ? `<div class="${klassen.join(" ")}">${html}</div>` : html;
}

function context(site: RenderableSite, opts: RenderOptions): Ctx {
  const media = new Map(site.media.map((m) => [m.id, m]));
  return {
    root: opts.root,
    pages: site.pages.map(zonderVerborgen),
    media,
    mediaSrc: opts.preview ? opts.preview.mediaUrl : (file) => `${opts.root}media/${file}`,
    preview: Boolean(opts.preview),
    bedrijf: site.bedrijf,
    voorbeeld: Boolean(site.voorbeeld),
    webshop: site.soort === "webshop",
    voorstel: site.voorstel ?? null,
    logo: site.theme.logo ? media.get(site.theme.logo) : undefined,
    vacatures: opts.vacatures,
    origin: opts.origin,
    premium: site.theme.stijl === "premium" || site.theme.stijl === "beleving" || site.theme.stijl === "diepte",
    beleving: site.theme.stijl === "beleving" || site.theme.stijl === "diepte",
    diepte: site.theme.stijl === "diepte",
    winkel: winkelVan(site),
    mandAantal: opts.mandAantal,
  };
}

/**
 * A block in the beleving style: its own layout for the opening, offer cards, steps,
 * reviews and the closing band, the premium one with a small label above it for the rest.
 * The first block after the opening (or after the page header, `i` -1) is on cream, as on the Schwarzwald site.
 */
function belevingHtml(b: Block, i: number, ctx: Ctx, page: Page): string {
  const withForm = ctx.pages.find((p) => p.blocks.some((x) => x.type === "contact"));
  const bc: BelevingCtx = {
    esc,
    paras,
    img: (id, sizes, eager, alt) => img(ctx, id, sizes, eager, alt),
    href: (raw) => href(ctx, raw),
    bedrijf: ctx.bedrijf,
    page,
    pages: ctx.pages,
    contact: withForm ? (withForm.id === page.id ? "#contact" : withForm.slug || "home") : null,
    stars: starsRow,
    galleryClass,
  };
  const alt = (i + 1) % 2 === 1 ? ' class="alt"' : "";
  // 3D: the opening, the ring of photos, the steps and the closing band have their own layout; the rest is beleving
  return (ctx.diepte ? diepteBlok(b, alt, bc) : null) ?? belevingBlok(b, alt, bc) ?? metKicker(renderBlock(b, i + 1, ctx), b, bc);
}

/** The inline CSS (only used in the builder's preview, on zekerflex.com) takes the fonts from the app's own /fonts/. */
const PREVIEW_FONTS = "/fonts/";

/** One of the site's own pages as a full HTML document. */
export function renderPage(site: RenderableSite, rawPage: Page, opts: RenderOptions): string {
  const ctx = context(site, opts);
  const page = zonderVerborgen(rawPage);
  // only the opening block has a visible h1; without one, an invisible h1 with the page title (screen readers, search engines),
  // or in beleving a dark page header with the title, as every page of schwarzwald.zekerflex.com has
  const hero = page.blocks.some((b) => b.type === "hero");
  const h1 = hero ? "" : ctx.beleving ? paginaKop(page, ctx.bedrijf, esc) : `<h1 class="vh">${esc(page.titel)}</h1>`;
  // in the builder's preview each block is clickable (data-blok → the editor selects it); visitors never get this
  const blokken = page.blocks.map((b, i) => {
    const html = ctx.beleving ? belevingHtml(b, hero ? i : i - 1, ctx, page) : renderBlock(b, i, ctx);
    const gestyled = metBlokstijl(b, html);
    return ctx.preview && gestyled ? `<div data-blok="${esc(b.id)}">${gestyled}</div>` : gestyled;
  });
  return htmlDoc(ctx, page, h1 + blokken.join(""), opts, siteCss(site.theme, PREVIEW_FONTS, heeftBurger(site.pages)));
}

const fixedPage = (id: string, slug: string, titel: string): Page => ({ id: `__${id}`, slug, titel, seoTitel: titel, seoOmschrijving: titel, blocks: [] });

/** The privacy statement, thank-you and not-found pages every site has. */
export function renderSystemPage(site: RenderableSite, kind: "privacy" | "bedankt" | "404", opts: RenderOptions): string {
  const ctx = context(site, opts);
  const c = site.bedrijf;
  const home = esc(ctx.preview ? "#" : homeHref(opts.root));
  const wrap = (inner: string) => `<section><div class="wrap narrow">${inner}</div></section>`;
  if (kind === "privacy") {
    // reserving or ordering on this site: say so, and what those details are used for
    const extra = [reserveerBlokVan(site.pages) && "een tafel reserveert", zichtbareProducten(ctx.winkel).length > 0 && "iets bestelt"].filter(Boolean);
    const ook = extra.length ? ` Hetzelfde geldt als je ${extra.join(" of ")}: dan gebruiken we je gegevens alleen daarvoor.` : "";
    const text = `${c.naam}${c.kvk ? ` (KVK ${c.kvk})` : ""} gaat zorgvuldig om met je gegevens.\n\nStuur je ons een bericht via het contactformulier, dan gebruiken we je naam, e-mailadres, telefoonnummer en bericht alleen om je te antwoorden.${ook} We bewaren ze niet langer dan nodig en delen ze met niemand, behalve met ZekerFlex, dat deze website voor ons host.\n\nDeze website gebruikt geen cookies en geen bezoekersvolgsystemen van anderen. Foto's en lettertypes komen van deze website zelf.\n\nWil je weten welke gegevens we van je hebben, of wil je ze laten verwijderen? Mail ons${c.email ? ` op ${c.email}` : ""}.`;
    return htmlDoc(ctx, fixedPage("privacy", "privacy", `Privacyverklaring | ${c.naam}`), wrap(`<h1>Privacyverklaring</h1>${paras(text)}`), opts, siteCss(site.theme, PREVIEW_FONTS));
  }
  if (kind === "bedankt") {
    return htmlDoc(ctx, fixedPage("bedankt", "bedankt", `Bedankt | ${c.naam}`), wrap(`<h1>Bedankt voor je bericht</h1>${paras("We hebben je bericht ontvangen en nemen zo snel mogelijk contact met je op.")}<p><a class="btn" href="${home}">Terug naar de website</a></p>`), opts, siteCss(site.theme, PREVIEW_FONTS));
  }
  return htmlDoc(ctx, fixedPage("404", "niet-gevonden", `Pagina niet gevonden | ${c.naam}`), wrap(`<h1>Deze pagina bestaat niet</h1>${paras("Misschien is hij verhuisd. Ga terug naar de homepagina.")}<p><a class="btn" href="${home}">Naar de homepagina</a></p>`), opts, siteCss(site.theme, PREVIEW_FONTS));
}

/**
 * "Wat kan deze site" (…/wat-kan-deze-site), like the tour on schwarzwald.zekerflex.com: what visitors can
 * do on this very site, each with a link to try it, and what the company gets behind the login
 * (lib/sites/wat-kan-deze-site.ts). Only on a proposal or an example; null on a company's own site.
 */
export function renderFunctiesPagina(site: RenderableSite, opts: RenderOptions & { chat?: boolean | undefined }): string | null {
  if (!site.voorstel && !site.voorbeeld) return null;
  const ctx = context(site, opts);
  const naam = esc(site.bedrijf.naam);
  const bel = ctx.beleving;
  const link = (raw: string) => {
    if (ctx.preview) return "#";
    if (raw.startsWith("_zf/")) return `${opts.root}${raw}`;
    const [slug = "", anker] = raw.split("#");
    const h = safeHref(slug, opts.root, ctx.pages);
    return anker ? `${h}#${anker}` : h;
  };
  const kaarten = (lijst: Functie[]) =>
    `<ul class="cards fn" role="list">${lijst
      .map((f) => `<li class="card"><h3>${esc(f.titel)}</h3>${paras(f.tekst)}${f.link ? `<p class="probeer"><a href="${esc(link(f.link))}">Probeer het<span class="vh">: ${esc(f.titel.toLowerCase())}</span></a></p>` : ""}</li>`)
      .join("")}</ul>`;
  const kop = `${bel ? `<section class="pagekop"><div class="wrap"><p class="kicker">Rondleiding</p>` : `<section class="hero"><div class="wrap">`}<h1>Wat deze site voor ${naam} doet</h1><p>${ctx.voorstel ? `Een nieuwe website voor ${naam}, gemaakt door ZekerFlex van jullie eigen teksten en foto's.` : `Een voorbeeld van wat de ${ctx.webshop ? "webshops" : "websites"} van ZekerFlex kunnen. ${naam} bestaat niet.`} Hieronder wat bezoekers ermee kunnen, en wat je zelf krijgt achter de login.</p></div></section>`;
  const bezoekers = `<section><div class="wrap"><p class="kicker">Voor je bezoekers</p><h2>Zelf regelen, wanneer het hen uitkomt</h2>${kaarten(functiesVoorBezoekers(site, { chat: opts.chat }))}</div></section>`;
  const jij = `<section class="alt"><div class="wrap"><p class="kicker">Voor jou</p><h2>Het beheer achter de login</h2>${kaarten(functiesVoorJou(site))}</div></section>`;
  const terug = esc(ctx.preview ? "#" : homeHref(opts.root));
  const acties = ctx.voorstel
    ? `<a class="btn${bel ? " dark" : ""}" href="mailto:info@zekerflex.com">Mail ZekerFlex</a><a class="btn line" href="${terug}">Terug naar de site</a>`
    : ctx.webshop
      ? `<a class="btn${bel ? " dark" : ""}" href="${esc(ctx.preview ? "#" : `${ctx.origin}/aanbod/webshop`)}">Open je eigen webshop</a><a class="btn line" href="${terug}">Terug naar de winkel</a>`
      : `<a class="btn${bel ? " dark" : ""}" href="${esc(ctx.preview ? "#" : `${ctx.origin}/website-check`)}">Laat er gratis een maken</a><a class="btn line" href="${esc(ctx.preview ? "#" : `${ctx.origin}/werkgever/website/bouwer`)}">Maak hem zelf</a>`;
  const slotTekst = ctx.voorstel
    ? "ZekerFlex zet hem op je eigen adres, met je eigen teksten en foto's, en houdt hem daarna bij."
    : ctx.webshop
      ? "Kies een ontwerp, zet je producten erin en stel verzenden, betalen en kortingen in. De pagina's over verzenden en voorwaarden staan als begin al klaar."
      : "Vul het adres van je huidige website in, dan maken we er gratis een nieuwe van. Of bouw hem zelf.";
  const slot = `<section class="band${bel ? " bel" : ""}"><div class="wrap"><h2>${ctx.voorstel ? "Wil je deze website?" : ctx.webshop ? "Zo'n webshop voor jouw bedrijf?" : "Zo'n website voor jouw bedrijf?"}</h2>${paras(slotTekst)}<p class="band-acts">${acties}</p></div></section>`;
  const page = fixedPage("functies", "wat-kan-deze-site", `Wat kan deze site | ${site.bedrijf.naam}`);
  return htmlDoc(ctx, page, kop + bezoekers + jij + slot, opts, siteCss(site.theme, PREVIEW_FONTS));
}

/** A page of the site's shop: a product, the overview, the order form, the check before ordering, the thank-you page. */
export type WinkelPagina =
  | { soort: "product"; slug: string; gemeld?: boolean | undefined }
  | { soort: "winkel"; filter?: WinkelFilter | undefined }
  | { soort: "bestellen"; invoer?: BestelInvoer | undefined; fouten?: string[] | undefined; vanMand?: boolean | undefined }
  | { soort: "controle"; concept: Bestelconcept; vanMand?: boolean | undefined }
  | { soort: "besteld"; nr: string; voorbeeld?: boolean | undefined; info?: BesteldInfo | null | undefined }
  | { soort: "mand"; mand: { regels: MandRegelInfo[]; subtotaalCents: number; aantal: number }; melding: string };

/** A shop page as a full HTML document; null when the product does not exist (or is hidden). */
export function renderWinkelPagina(site: RenderableSite, w: WinkelPagina, opts: RenderOptions): string | null {
  const ctx = context(site, opts);
  const wc = winkelCtx(ctx);
  const css = siteCss(site.theme, PREVIEW_FONTS);
  const naam = site.bedrijf.naam;
  switch (w.soort) {
    case "product": {
      const p = zichtbareProducten(ctx.winkel).find((x) => x.slug === w.slug);
      if (!p) return null;
      const m = p.fotos[0] ? ctx.media.get(p.fotos[0]) : undefined;
      const page: Page = { id: `product-${p.id}`, slug: `p/${p.slug}`, titel: p.naam, seoTitel: `${p.naam} | ${naam}`.slice(0, 70), seoOmschrijving: (p.korteTekst || p.omschrijving).replace(/\s+/g, " ").slice(0, 160), blocks: [] };
      const meta = { url: `${opts.origin}${opts.root}p/${p.slug}`, beeld: m ? `${opts.origin}${opts.root}media/${m.file}` : null, seo: !ctx.voorbeeld && !ctx.voorstel, gemeld: w.gemeld };
      return htmlDoc(ctx, page, productPaginaBody(wc, ctx.winkel, p, meta), opts, css, m?.id ?? null);
    }
    case "winkel":
      return htmlDoc(ctx, { id: "winkel", slug: "winkel", titel: "Winkel", seoTitel: `Winkel | ${naam}`, seoOmschrijving: `Bekijk en bestel het assortiment van ${naam}.`.slice(0, 160), blocks: [] }, winkelPaginaBody(wc, ctx.winkel, w.filter), opts, css, zichtbareProducten(ctx.winkel)[0]?.fotos[0] ?? null);
    case "bestellen":
      return htmlDoc(ctx, fixedPage("bestellen", "bestellen", `Bestellen | ${naam}`), bestelPaginaBody(wc, ctx.winkel, { invoer: w.invoer, fouten: w.fouten, vanMand: w.vanMand }), opts, css);
    case "controle":
      return htmlDoc(ctx, fixedPage("controle", "bestellen", `Klopt je bestelling? | ${naam}`), controlePaginaBody(wc, ctx.winkel, w.concept, w.vanMand), opts, css);
    case "besteld":
      return htmlDoc(ctx, fixedPage("besteld", "besteld", `Bedankt voor je bestelling | ${naam}`), besteldPaginaBody(wc, ctx.winkel, w.nr, w.voorbeeld, w.info ?? null), opts, css);
    case "mand":
      return htmlDoc(ctx, fixedPage("mand", "mand", `Winkelmand | ${naam}`), mandPaginaBody(wc, ctx.winkel, w.mand, w.melding), opts, css);
  }
}

/** A page for reserving a table: the free times and the guest's details, or the confirmation. */
export type ReserveerPagina =
  | { soort: "reserveren"; staat: ReserveerStaat }
  | { soort: "gereserveerd"; reservering: { nr: string; datum: string; tijd: string; personen: number } | null; voorbeeld: boolean };

/** At most `max` characters, ending on a whole sentence when there is one ("…graa" never shows). */
function totZin(s: string, max: number): string {
  if (s.length <= max) return s;
  const stuk = s.slice(0, max);
  const eind = Math.max(stuk.lastIndexOf(". "), stuk.lastIndexOf("? "), stuk.lastIndexOf("! "));
  return eind > 40 ? stuk.slice(0, eind + 1) : `${stuk.slice(0, stuk.lastIndexOf(" "))}…`;
}

/** A reservation page as a full HTML document; null when the site takes no reservations. */
export function renderReserveerPagina(site: RenderableSite, w: ReserveerPagina, opts: RenderOptions): string | null {
  const blok = reserveerBlokVan(site.pages);
  if (!blok) return null;
  const ctx = context(site, opts);
  const rc = reserveerCtx(ctx);
  const css = siteCss(site.theme, PREVIEW_FONTS);
  const naam = site.bedrijf.naam;
  if (w.soort === "gereserveerd") {
    return htmlDoc(ctx, fixedPage("gereserveerd", "gereserveerd", `Gereserveerd | ${naam}`), gereserveerdBody(rc, w.reservering, w.voorbeeld), opts, css);
  }
  // beleving: the dark page header with the title, like every page of schwarzwald.zekerflex.com
  const page: Page = { id: "reserveren-pagina", slug: "reserveren", titel: blok.kop || "Reserveren", seoTitel: `Reserveren | ${naam}`.slice(0, 70), seoOmschrijving: totZin(blok.tekst || `Reserveer online een tafel bij ${naam}.`, 160), blocks: [] };
  const kop = ctx.beleving ? paginaKop(page, ctx.bedrijf, esc) : "";
  return htmlDoc(ctx, page, kop + reserveerPaginaBody(rc, blok, w.staat, !ctx.beleving), opts, css);
}

export function renderSitemap(site: RenderableSite, opts: RenderOptions): string {
  const winkel = zichtbareProducten(winkelVan(site));
  const urls = [
    ...site.pages.map((p) => `${opts.origin}${p.slug ? `${opts.root}${p.slug}` : homeHref(opts.root)}`),
    // the shop: the overview and every visible product page
    ...(winkel.length ? [`${opts.origin}${opts.root}winkel`, ...winkel.map((p) => `${opts.origin}${opts.root}p/${p.slug}`)] : []),
    // reserving a table
    ...(reserveerBlokVan(site.pages) ? [`${opts.origin}${opts.root}reserveren`] : []),
  ];
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
