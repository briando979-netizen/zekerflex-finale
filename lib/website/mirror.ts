import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { logger } from "@/lib/logger";
import { FetchError, fetchResource } from "@/lib/website-check/fetch";
import { buildFindings, extractFacts, scoreFindings, type ExtraInput, type Finding } from "@/lib/website-check/analyze";
import { sameSite } from "@/lib/website-check/run";

// ---------------------------------------------------------------------------
// Website-verhuizer: maakt een exacte kopie van de website van een klant (die
// aantoonbaar eigenaar is, zie lib/website/verify.ts) en verbetert die meteen:
// afbeeldingen kleiner en pas laden bij scrollen, ontbrekende instellingen voor
// telefoons en Google aangevuld, onveilige http-verwijzingen weg, een sitemap.
// Uiterlijk en teksten blijven gelijk. De kopie staat op de eigen schijf
// (storage/sites/<id>/files) met verwijzingen vanaf de root, precies zoals hij
// live zou gaan; /website-preview/<id>/ toont hem in een afgeschermde sandbox.
// Begrensd in pagina's, bestanden en grootte, en er draait er één tegelijk.
// ---------------------------------------------------------------------------

export const SITES_DIR = process.env.SITE_MIRROR_DIR || path.join(process.cwd(), "storage", "sites");
const MAX_PAGES = 40;
const MAX_ASSETS = 600;
const MAX_ASSET_BYTES = 15_000_000;
const MAX_TOTAL_BYTES = 200_000_000;
const STALE_MS = 30 * 60_000;
const KEEP_PER_SITE = 3;
const PAGE_CONCURRENCY = 3;
const ASSET_CONCURRENCY = 6;

export interface MirrorUpgrades {
  lazyImages: number;
  imagesCompressed: number;
  bytesSaved: number;
  httpsFixed: number;
  viewportAdded: number;
  langAdded: number;
  descriptionAdded: number;
  socialAdded: number;
  canonicalAdded: number;
  generatorRemoved: number;
  sitemapAdded: boolean;
}

export interface MirrorPage {
  url: string;
  file: string;
  title: string | null;
  status: number;
}

export interface MirrorRecord {
  id: string;
  siteId: string;
  tenantId: string;
  origin: string;
  status: "bezig" | "klaar" | "mislukt";
  startedAt: string;
  finishedAt: string | null;
  startedBy: string;
  progress: { pages: number; assets: number };
  pages: MirrorPage[];
  assets: number;
  bytes: number;
  missing: number;
  brokenLinks: string[];
  upgrades: MirrorUpgrades;
  dynamic: string[];
  before: { score: number; findings: Finding[] } | null;
  after: { score: number; findings: Finding[] } | null;
  error: string | null;
}

const KEY = (id: string) => `site-mirror:${id}`;
const LIST_KEY = (siteId: string) => `site-mirror-list:${siteId}`;
const LOCK_KEY = "site-mirror-running";

export const isMirrorId = (id: string) => /^[a-f0-9]{16}$/.test(id);
export const mirrorDir = (id: string) => path.join(SITES_DIR, id, "files");

const HTML_EXT = /\.(html?|php|aspx?|jsp|cfm)$/i;

/** Waar een URL in de kopie komt te staan, als pad vanaf de root zonder voorloop-slash. */
export function localPathFor(u: URL, isHtml: boolean, contentType = ""): string {
  let p: string;
  try {
    p = decodeURIComponent(u.pathname);
  } catch {
    p = u.pathname;
  }
  if (p.endsWith("/")) p += "index.html";
  else if (isHtml && !HTML_EXT.test(p)) p += "/index.html";
  let segs = p
    .split("/")
    .filter((s) => s && s !== "." && s !== "..")
    .map((s) => s.replace(/[\0<>:"|?*\\]/g, "_").slice(0, 120));
  if (segs.length === 0) segs = ["index.html"];
  let out = segs.join("/");
  // Bestanden die alleen door hun query verschillen (bijv. /beeld.php?id=3) krijgen elk een eigen naam.
  if (!isHtml && u.search && !/\.(css|js|mjs|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|eot|mp4|webm|pdf)$/i.test(out)) {
    const ext = EXT_FOR_TYPE[contentType.split(";")[0]?.trim() ?? ""] ?? "";
    out = `${out}__${createHash("sha1").update(u.search).digest("hex").slice(0, 8)}${ext}`;
  }
  return out;
}

const EXT_FOR_TYPE: Record<string, string> = {
  "text/css": ".css",
  "application/javascript": ".js",
  "text/javascript": ".js",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
  "font/woff2": ".woff2",
  "font/woff": ".woff",
};

/** Het pad waarmee een pagina of bestand in de kopie wordt aangewezen ("/over-ons/" i.p.v. "/over-ons/index.html"). */
const publicPath = (file: string) => `/${file.replace(/(^|\/)index\.html$/, "$1")}`;

const decodeAttr = (v: string) => v.replace(/&amp;/g, "&").replace(/&#0?38;/g, "&").trim();

function attrValues(html: string, tag: string, attr: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(new RegExp(`<${tag}\\b[^>]*>`, "gi"))) {
    const a = new RegExp(`\\s${attr}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i").exec(m[0]);
    if (a) out.push(decodeAttr(a[1] ?? a[2] ?? ""));
  }
  return out;
}

const srcsetUrls = (v: string) => v.split(",").map((part) => part.trim().split(/\s+/)[0] ?? "").filter(Boolean);
const cssUrls = (css: string) => [
  ...[...css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi)].map((m) => m[2] ?? ""),
  ...[...css.matchAll(/@import\s+(['"])([^'"]+)\1/gi)].map((m) => m[2] ?? ""),
].filter((u) => u && !/^(data:|#|about:)/i.test(u));

/** Alle bestanden waar een pagina naar verwijst (stijl, scripts, beeld, lettertypes). */
export function discoverAssets(html: string): string[] {
  const linkRel = /\srel\s*=\s*["']?[^"'>]*(stylesheet|icon|preload|manifest|mask-icon|apple-touch)/i;
  const links = (html.match(/<link\b[^>]*>/gi) ?? [])
    .filter((t) => linkRel.test(t))
    .map((t) => /\shref\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(t))
    .map((m) => (m ? decodeAttr(m[1] ?? m[2] ?? "") : ""));
  const metaImages = (html.match(/<meta\b[^>]*>/gi) ?? [])
    .filter((t) => /(og:image|twitter:image)/i.test(t))
    .map((t) => /\scontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(t))
    .map((m) => (m ? decodeAttr(m[1] ?? m[2] ?? "") : ""));
  const styles = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1] ?? "").join("\n");
  const inline = [...html.matchAll(/\sstyle\s*=\s*"([^"]*)"/gi)].map((m) => decodeAttr(m[1] ?? "")).join("\n");
  return [
    ...links,
    ...metaImages,
    ...attrValues(html, "script", "src"),
    ...["img", "source"].flatMap((t) => [
      ...attrValues(html, t, "src"),
      ...attrValues(html, t, "data-src"),
      ...attrValues(html, t, "data-lazy-src"),
      ...attrValues(html, t, "srcset").flatMap(srcsetUrls),
      ...attrValues(html, t, "data-srcset").flatMap(srcsetUrls),
    ]),
    ...attrValues(html, "video", "src"),
    ...attrValues(html, "video", "poster"),
    ...attrValues(html, "audio", "src"),
    ...cssUrls(styles),
    ...cssUrls(inline),
  ].filter((u) => u && !/^(data:|blob:|javascript:|#|mailto:|tel:)/i.test(u));
}

type UrlMap = Map<string, string>;

function canonicalUrl(raw: string, base: URL): URL | null {
  try {
    const u = new URL(raw, base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    return u;
  } catch {
    return null;
  }
}

/** Sleutel in de URL-tabel: zonder protocol en zonder www, zodat http/https en www/zonder op hetzelfde uitkomen. */
const mapKey = (u: URL, keepQuery: boolean) => `${u.hostname.replace(/^www\./, "")}${u.pathname}${keepQuery ? u.search : ""}`;

function lookupMapped(map: UrlMap, u: URL): string | undefined {
  return map.get(mapKey(u, true)) ?? map.get(mapKey(u, false));
}

/** Herschrijft verwijzingen naar de eigen site naar paden in de kopie; telt http→https-reparaties. */
export function rewriteRefs(text: string, base: URL, map: UrlMap, site: string, counters: { httpsFixed: number; missing: number }, kind: "html" | "css"): string {
  const own = (u: URL) => sameSite(u.hostname, site);
  const swap = (raw: string): string => {
    const value = decodeAttr(raw);
    if (!value || /^(data:|blob:|javascript:|#|mailto:|tel:|about:)/i.test(value)) return raw;
    const u = canonicalUrl(value, base);
    if (!u) return raw;
    if (!own(u)) {
      if (u.protocol === "http:" && /^http:\/\//i.test(value)) {
        counters.httpsFixed += 1;
        return value.replace(/^http:/i, "https:");
      }
      return raw;
    }
    const mapped = lookupMapped(map, u);
    if (/^http:\/\//i.test(value)) counters.httpsFixed += 1;
    if (mapped) return mapped;
    counters.missing += 1;
    return `https://${u.host}${u.pathname}${u.search}`;
  };

  if (kind === "css") {
    return text
      .replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (_m, q: string, v: string) => `url(${q}${swap(v)}${q})`)
      .replace(/@import\s+(['"])([^'"]+)\1/gi, (_m, q: string, v: string) => `@import ${q}${swap(v)}${q}`);
  }
  return text
    .replace(/(\s(?:href|src|poster|action|data-src|data-lazy-src|content)\s*=\s*)("([^"]*)"|'([^']*)')/gi, (m, pre: string, _q: string, d?: string, s?: string) => {
      const v = d ?? s ?? "";
      // content="" alleen voor og:image/twitter:image-achtige URL's, niet voor gewone tekst
      if (/content\s*=\s*$/i.test(pre) && !/^(https?:)?\/\//i.test(v.trim())) return m;
      const q = d !== undefined ? '"' : "'";
      return `${pre}${q}${swap(v)}${q}`;
    })
    .replace(/(\s(?:srcset|data-srcset)\s*=\s*)("([^"]*)"|'([^']*)')/gi, (_m, pre: string, _q: string, d?: string, s?: string) => {
      const v = d ?? s ?? "";
      const q = d !== undefined ? '"' : "'";
      const parts = v.split(",").map((part) => {
        const [url, ...rest] = part.trim().split(/\s+/);
        return url ? [swap(url), ...rest].join(" ") : "";
      });
      return `${pre}${q}${parts.filter(Boolean).join(", ")}${q}`;
    })
    .replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_m, open: string, css: string, close: string) => open + rewriteRefs(css, base, map, site, counters, "css") + close)
    .replace(/(\sstyle\s*=\s*")([^"]*)(")/gi, (_m, open: string, css: string, close: string) => open + rewriteRefs(css, base, map, site, counters, "css") + close);
}

const looksDutch = (html: string) => {
  const text = html.replace(/<[^>]+>/g, " ").toLowerCase();
  const nl = (text.match(/\s(de|het|een|en|van|voor|met|wij|onze)\s/g) ?? []).length;
  const en = (text.match(/\s(the|and|for|with|our|you|your)\s/g) ?? []).length;
  return nl >= en;
};

/** De verbeteringen op één pagina. Het uiterlijk blijft gelijk; alleen wat ontbrak of traag maakt verandert. */
export function upgradeHtml(html: string, opts: { canonical: string; ogImage: string | null }, up: MirrorUpgrades): string {
  let out = html.replace(/<base\b[^>]*>/gi, "");
  const head = /<head\b[^>]*>/i;
  const inject: string[] = [];
  const metas = out.match(/<meta\b[^>]*>/gi) ?? [];
  const has = (re: RegExp) => metas.some((m) => re.test(m));

  if (!has(/name\s*=\s*["']?viewport/i)) {
    inject.push('<meta name="viewport" content="width=device-width, initial-scale=1">');
    up.viewportAdded += 1;
  }
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(out)?.[1]?.replace(/\s+/g, " ").trim() ?? "";
  let description = metas.map((m) => (/name\s*=\s*["']?description/i.test(m) ? /content\s*=\s*"([^"]*)"/i.exec(m)?.[1] ?? "" : "")).find(Boolean) ?? "";
  if (!description) {
    const firstP = [...out.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
      .map((m) => (m[1] ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
      .find((t) => t.length >= 50);
    if (firstP) {
      description = firstP.length > 155 ? `${firstP.slice(0, 152).replace(/\s+\S*$/, "")}…` : firstP;
      inject.push(`<meta name="description" content="${description.replace(/"/g, "&quot;")}">`);
      up.descriptionAdded += 1;
    }
  }
  if (!has(/property\s*=\s*["']?og:title/i) && title) {
    inject.push(`<meta property="og:title" content="${title.replace(/"/g, "&quot;")}">`);
    if (description) inject.push(`<meta property="og:description" content="${description.replace(/"/g, "&quot;")}">`);
    if (opts.ogImage && !has(/property\s*=\s*["']?og:image/i)) inject.push(`<meta property="og:image" content="${opts.ogImage}">`);
    up.socialAdded += 1;
  }
  if (!/<link\b[^>]*rel\s*=\s*["']?canonical/i.test(out)) {
    inject.push(`<link rel="canonical" href="${opts.canonical}">`);
    up.canonicalAdded += 1;
  }
  const before = out.length;
  out = out.replace(/<meta\b[^>]*name\s*=\s*["']?generator["']?[^>]*>/gi, "");
  if (out.length !== before) up.generatorRemoved += 1;

  if (inject.length > 0) {
    out = head.test(out) ? out.replace(head, (m) => `${m}\n${inject.join("\n")}`) : `${inject.join("\n")}\n${out}`;
  }
  const htmlTag = /<html\b[^>]*>/i.exec(out)?.[0];
  if (htmlTag && !/\slang\s*=/i.test(htmlTag)) {
    out = out.replace(htmlTag, htmlTag.replace(/<html/i, `<html lang="${looksDutch(out) ? "nl" : "en"}"`));
    up.langAdded += 1;
  }
  // De eerste twee afbeeldingen staan meestal bovenin: die laden direct, de rest pas bij scrollen.
  let n = 0;
  out = out.replace(/<img\b[^>]*>/gi, (tag) => {
    n += 1;
    if (n <= 2 || /\sloading\s*=/i.test(tag)) return tag;
    up.lazyImages += 1;
    return tag.replace(/<img/i, '<img loading="lazy" decoding="async"');
  });
  return out;
}

/** Wat in een statische kopie niet vanzelf blijft werken, in gewone taal. */
export function detectDynamic(html: string): string[] {
  const out = new Set<string>();
  if (/wpcf7|wpforms|gform_|elementor-form|contact-form|ninja-forms|formidable/i.test(html)) out.add("Contactformulier: dat stuurt nu naar de oude server. Bij livegang komt er een formulier voor in de plaats dat in je mailbox binnenkomt.");
  else if (/<form\b[^>]*method\s*=\s*["']?post/i.test(html)) out.add("Formulier dat gegevens naar de server stuurt: dat koppelen we bij livegang opnieuw.");
  if (/woocommerce|add-to-cart|\/cart\/|winkelwagen|shopify/i.test(html)) out.add("Webshop of winkelwagen: bestellen kan in een statische kopie niet. Die blijft op het huidige systeem of verhuist apart.");
  if (/<input\b[^>]*name\s*=\s*["']?s["'\s>]/i.test(html) || /role\s*=\s*["']?search/i.test(html)) out.add("Zoekfunctie: die zoekt nu op de oude server.");
  if (/type\s*=\s*["']?password/i.test(html)) out.add("Inloggen: een ledengedeelte werkt niet in een statische kopie.");
  if (/admin-ajax\.php|\/wp-json\//i.test(html)) out.add("Onderdelen die gegevens van de server ophalen (zoals filters of 'meer laden').");
  return [...out];
}

async function compressImage(data: Buffer, file: string): Promise<Buffer | null> {
  if (data.length < 150_000 || !/\.(jpe?g|png|webp)$/i.test(file)) return null;
  try {
    const sharp = (await import("sharp")).default;
    const img = sharp(data, { failOn: "none" }).rotate().resize({ width: 2000, withoutEnlargement: true });
    const out = /\.png$/i.test(file)
      ? await img.png({ compressionLevel: 9, effort: 8 }).toBuffer()
      : /\.webp$/i.test(file)
        ? await img.webp({ quality: 80 }).toBuffer()
        : await img.jpeg({ quality: 80, mozjpeg: true }).toBuffer();
    return out.length < data.length * 0.95 ? out : null;
  } catch {
    return null;
  }
}

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  await Promise.all(Array.from({ length: size }, async () => {
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) await fn(next);
  }));
}

async function writeFileSafe(root: string, rel: string, data: Buffer | string): Promise<void> {
  const target = path.resolve(root, rel);
  if (!target.startsWith(path.resolve(root) + path.sep)) throw new Error(`ongeldig pad: ${rel}`);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, data);
}

const emptyUpgrades = (): MirrorUpgrades => ({
  lazyImages: 0, imagesCompressed: 0, bytesSaved: 0, httpsFixed: 0, viewportAdded: 0, langAdded: 0,
  descriptionAdded: 0, socialAdded: 0, canonicalAdded: 0, generatorRemoved: 0, sitemapAdded: false,
});

export async function getMirror(id: string): Promise<MirrorRecord | null> {
  if (!isMirrorId(id)) return null;
  const rec = await kvGet<MirrorRecord>(KEY(id)).catch(() => null);
  if (rec && rec.status === "bezig" && Date.now() - Date.parse(rec.startedAt) > STALE_MS) {
    return { ...rec, status: "mislukt", error: rec.error ?? "Afgebroken (de server is tussendoor herstart)." };
  }
  return rec;
}

export async function latestMirror(siteId: string): Promise<MirrorRecord | null> {
  const ids = (await kvGet<string[]>(LIST_KEY(siteId)).catch(() => null)) ?? [];
  const last = ids[ids.length - 1];
  return last ? getMirror(last) : null;
}

/** Start een kopie op de achtergrond. Gooit als er al een loopt. */
export async function startMirror(input: { siteId: string; tenantId: string; host: string; startedBy: string }): Promise<MirrorRecord> {
  const lock = await kvGet<{ id: string; at: string }>(LOCK_KEY).catch(() => null);
  if (lock && Date.now() - Date.parse(lock.at) < STALE_MS) {
    const running = await getMirror(lock.id);
    if (running?.status === "bezig") throw new Error("Er loopt al een kopie. Wacht tot die klaar is.");
  }
  const rec: MirrorRecord = {
    id: randomBytes(8).toString("hex"),
    siteId: input.siteId,
    tenantId: input.tenantId,
    origin: `https://${input.host}`,
    status: "bezig",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    startedBy: input.startedBy,
    progress: { pages: 0, assets: 0 },
    pages: [],
    assets: 0,
    bytes: 0,
    missing: 0,
    brokenLinks: [],
    upgrades: emptyUpgrades(),
    dynamic: [],
    before: null,
    after: null,
    error: null,
  };
  await kvSet(KEY(rec.id), rec);
  await kvSet(LOCK_KEY, { id: rec.id, at: rec.startedAt });
  const ids = (await kvGet<string[]>(LIST_KEY(input.siteId)).catch(() => null)) ?? [];
  const keep = [...ids, rec.id];
  for (const old of keep.slice(0, Math.max(0, keep.length - KEEP_PER_SITE))) {
    await rm(path.join(SITES_DIR, old), { recursive: true, force: true }).catch(() => undefined);
  }
  await kvSet(LIST_KEY(input.siteId), keep.slice(-KEEP_PER_SITE));

  void runMirror(rec).catch(async (err) => {
    logger.error("site mirror crashed", { id: rec.id, error: (err as Error).message });
    await kvSet(KEY(rec.id), { ...rec, status: "mislukt", finishedAt: new Date().toISOString(), error: "Onverwachte fout tijdens het kopiëren." });
  });
  return rec;
}

async function runMirror(rec: MirrorRecord): Promise<void> {
  const root = mirrorDir(rec.id);
  await rm(path.join(SITES_DIR, rec.id), { recursive: true, force: true });
  await mkdir(root, { recursive: true });
  let lastSave = 0;
  const save = async (force = false) => {
    if (!force && Date.now() - lastSave < 2000) return;
    lastSave = Date.now();
    await kvSet(KEY(rec.id), rec).catch(() => undefined);
  };

  try {
    // 1. Pagina's ophalen (breedte eerst, alleen de eigen site).
    const home = await fetchResource(`${rec.origin}/`, { timeoutMs: 15_000 });
    if (home.status >= 400) throw new FetchError(`De website gaf foutcode ${home.status}.`, "NETWORK");
    const site = new URL(home.finalUrl).hostname;
    rec.origin = new URL(home.finalUrl).origin;

    const map: UrlMap = new Map();
    const pages = new Map<string, { url: URL; html: string; status: number; file: string }>();
    const queued = new Set<string>([mapKey(new URL(home.finalUrl), false)]);
    let queue: URL[] = [];
    const linkStatus = new Map<string, number | null>();

    const addPage = (url: URL, html: string, status: number) => {
      const file = localPathFor(url, true);
      pages.set(mapKey(url, false), { url, html, status, file });
      map.set(mapKey(url, false), publicPath(file));
      for (const href of attrValues(html, "a", "href")) {
        const u = canonicalUrl(href, url);
        if (!u || !sameSite(u.hostname, site) || /\.(pdf|zip|jpe?g|png|gif|webp|svg|mp4|docx?|xlsx?)$/i.test(u.pathname)) continue;
        if (/\/(wp-admin|wp-login|cart|winkelwagen|checkout|afrekenen|my-account|mijn-account|feed)\b/i.test(u.pathname)) continue;
        const k = mapKey(u, false);
        if (queued.has(k)) continue;
        queued.add(k);
        queue.push(u);
      }
    };
    addPage(new URL(home.finalUrl), home.data.toString("utf8"), home.status);

    while (queue.length > 0 && pages.size < MAX_PAGES) {
      const batch = queue.splice(0, Math.min(queue.length, MAX_PAGES - pages.size));
      await pool(batch, PAGE_CONCURRENCY, async (u) => {
        try {
          const res = await fetchResource(u.toString(), { timeoutMs: 15_000 });
          linkStatus.set(u.toString(), res.status);
          const type = res.headers["content-type"] ?? "";
          const final = new URL(res.finalUrl);
          if (res.status >= 400 || !/text\/html|xhtml/i.test(type) || !sameSite(final.hostname, site) || pages.size >= MAX_PAGES) return;
          addPage(final, res.data.toString("utf8"), res.status);
          if (mapKey(final, false) !== mapKey(u, false)) map.set(mapKey(u, false), publicPath(localPathFor(final, true)));
        } catch {
          linkStatus.set(u.toString(), null);
        }
        rec.progress.pages = pages.size;
        await save();
      });
    }
    queue = [];

    // 2. Bestanden ophalen (stijl, scripts, beeld, lettertypes), ook wat stijlbestanden zelf laden.
    const assetQueue: URL[] = [];
    const seenAssets = new Set<string>();
    const enqueueAsset = (raw: string, base: URL) => {
      const u = canonicalUrl(raw, base);
      if (!u || !sameSite(u.hostname, site) || seenAssets.has(mapKey(u, true)) || seenAssets.size >= MAX_ASSETS) return;
      seenAssets.add(mapKey(u, true));
      assetQueue.push(u);
    };
    for (const p of pages.values()) for (const a of discoverAssets(p.html)) enqueueAsset(a, p.url);

    const cssFiles: { url: URL; file: string; css: string }[] = [];
    while (assetQueue.length > 0) {
      const batch = assetQueue.splice(0, assetQueue.length);
      await pool(batch, ASSET_CONCURRENCY, async (u) => {
        if (rec.bytes > MAX_TOTAL_BYTES) return;
        try {
          const res = await fetchResource(u.toString(), { timeoutMs: 20_000, maxBytes: MAX_ASSET_BYTES });
          if (res.status >= 400 || res.truncated) return;
          const type = res.headers["content-type"] ?? "";
          const file = localPathFor(u, false, type);
          map.set(mapKey(u, true), `/${file}`);
          if (!u.search) map.set(mapKey(u, false), `/${file}`);
          if (/text\/css/i.test(type) || /\.css$/i.test(file)) {
            const css = res.data.toString("utf8");
            cssFiles.push({ url: new URL(res.finalUrl), file, css });
            for (const nested of cssUrls(css)) enqueueAsset(nested, new URL(res.finalUrl));
          } else {
            let data = res.data;
            const smaller = await compressImage(data, file);
            if (smaller) {
              rec.upgrades.imagesCompressed += 1;
              rec.upgrades.bytesSaved += data.length - smaller.length;
              data = smaller;
            }
            await writeFileSafe(root, file, data);
            rec.bytes += data.length;
          }
          rec.assets += 1;
          rec.progress.assets = rec.assets;
          await save();
        } catch {
          /* niet op te halen: de verwijzing blijft naar de originele site wijzen */
        }
      });
    }

    // 3. Verwijzingen omschrijven, verbeteringen toepassen, wegschrijven.
    const counters = { httpsFixed: 0, missing: 0 };
    for (const c of cssFiles) {
      const css = rewriteRefs(c.css, c.url, map, site, counters, "css");
      await writeFileSafe(root, c.file, css);
      rec.bytes += Buffer.byteLength(css);
    }
    const allDynamic = new Set<string>();
    const homeKey = mapKey(new URL(home.finalUrl), false);
    let homeAfter = "";
    for (const [key, p] of pages) {
      detectDynamic(p.html).forEach((d) => allDynamic.add(d));
      const firstImg = attrValues(p.html, "img", "src")[0];
      const ogImg = firstImg ? canonicalUrl(firstImg, p.url) : null;
      let html = rewriteRefs(p.html, p.url, map, site, counters, "html");
      html = upgradeHtml(html, { canonical: `${rec.origin}${publicPath(p.file)}`, ogImage: ogImg && sameSite(ogImg.hostname, site) ? `${rec.origin}${lookupMapped(map, ogImg) ?? ogImg.pathname}` : null }, rec.upgrades);
      await writeFileSafe(root, p.file, html);
      rec.bytes += Buffer.byteLength(html);
      rec.pages.push({ url: p.url.toString(), file: p.file, title: /<title[^>]*>([\s\S]*?)<\/title>/i.exec(p.html)?.[1]?.replace(/\s+/g, " ").trim().slice(0, 120) ?? null, status: p.status });
      if (key === homeKey) homeAfter = html;
    }
    rec.upgrades.httpsFixed = counters.httpsFixed;
    rec.missing = counters.missing;
    rec.dynamic = [...allDynamic];
    rec.brokenLinks = [...linkStatus].filter(([, s]) => s === null || (s ?? 0) >= 400).map(([u]) => u).slice(0, 30);

    // 4. robots.txt en sitemap: die van de site zelf, anders maken we ze.
    const robots = await fetchResource(`${rec.origin}/robots.txt`, { timeoutMs: 8_000 }).catch(() => null);
    const robotsTxt = robots && robots.status === 200 && !/<html/i.test(robots.data.toString("utf8").slice(0, 300)) ? robots.data.toString("utf8") : null;
    const sitemap = await fetchResource(`${rec.origin}/sitemap.xml`, { timeoutMs: 8_000, headersOnly: true }).catch(() => null);
    const hadSitemap = Boolean(sitemap && sitemap.status === 200) || /^\s*sitemap\s*:/im.test(robotsTxt ?? "");
    if (!hadSitemap) {
      const urls = rec.pages.map((p) => `  <url><loc>${rec.origin}${publicPath(p.file).replace(/&/g, "&amp;")}</loc></url>`).join("\n");
      await writeFileSafe(root, "sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
      await writeFileSafe(root, "robots.txt", `${robotsTxt ? robotsTxt.trim() : "User-agent: *\nAllow: /"}\n\nSitemap: ${rec.origin}/sitemap.xml\n`);
      rec.upgrades.sitemapAdded = true;
    } else if (robotsTxt) {
      await writeFileSafe(root, "robots.txt", robotsTxt);
    }

    // 5. Voor en na: dezelfde meting op de homepage, met dezelfde server en instellingen.
    const httpVersion = await fetchResource(`http://${site}/`, { headersOnly: true, timeoutMs: 6_000 }).catch(() => null);
    const homeHtml = home.data.toString("utf8");
    const homeLinks = extractFacts(homeHtml, home.finalUrl, home.headers).internalLinks
      .filter((u) => linkStatus.has(u))
      .map((u) => ({ url: u, status: linkStatus.get(u) ?? null }));
    const extraBefore: ExtraInput = { httpRedirectsTo: httpVersion?.finalUrl ?? null, robotsTxt, sitemapFound: hadSitemap, links: homeLinks };
    const pageInput = (html: string) => ({ finalUrl: home.finalUrl, status: home.status, headers: home.headers, html, bytes: Buffer.byteLength(html), transferBytes: home.transferBytes, ttfbMs: home.ttfbMs });
    const beforeFindings = buildFindings(pageInput(homeHtml), extractFacts(homeHtml, home.finalUrl, home.headers), extraBefore);
    const afterHtml = homeAfter || homeHtml;
    const afterFindings = buildFindings(pageInput(afterHtml), extractFacts(afterHtml, home.finalUrl, home.headers), {
      ...extraBefore,
      robotsTxt: robotsTxt ?? "User-agent: *\nAllow: /",
      sitemapFound: true,
    });
    rec.before = { score: scoreFindings(beforeFindings).score, findings: beforeFindings };
    rec.after = { score: scoreFindings(afterFindings).score, findings: afterFindings };

    rec.status = "klaar";
    rec.finishedAt = new Date().toISOString();
    rec.progress = { pages: rec.pages.length, assets: rec.assets };
    await save(true);
    logger.info("site mirror done", { id: rec.id, pages: rec.pages.length, assets: rec.assets, bytes: rec.bytes });
  } catch (err) {
    rec.status = "mislukt";
    rec.finishedAt = new Date().toISOString();
    rec.error = err instanceof FetchError ? err.message : "Het kopiëren is mislukt.";
    await save(true);
    logger.warn("site mirror failed", { id: rec.id, error: (err as Error).message });
  } finally {
    const lock = await kvGet<{ id: string }>(LOCK_KEY).catch(() => null);
    if (lock?.id === rec.id) await kvSet(LOCK_KEY, { id: rec.id, at: new Date(0).toISOString() }).catch(() => undefined);
  }
}

const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8", php: "text/html; charset=utf-8", asp: "text/html; charset=utf-8",
  aspx: "text/html; charset=utf-8", jsp: "text/html; charset=utf-8", cfm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8", js: "text/javascript; charset=utf-8", mjs: "text/javascript; charset=utf-8",
  json: "application/json", xml: "application/xml", txt: "text/plain; charset=utf-8", webmanifest: "application/manifest+json",
  svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif", ico: "image/x-icon",
  woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf", eot: "application/vnd.ms-fontobject",
  mp4: "video/mp4", webm: "video/webm", mp3: "audio/mpeg", pdf: "application/pdf",
};

/** Zoekt het bestand bij een pad in de kopie ("/over-ons" → over-ons/index.html). Nooit buiten de map. */
export async function resolveMirrorFile(id: string, segments: string[]): Promise<{ file: string; type: string } | null> {
  if (!isMirrorId(id)) return null;
  const root = path.resolve(mirrorDir(id));
  const rel = segments.map((s) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  }).filter((s) => s && s !== "." && s !== "..").join("/");
  const candidates = rel ? [rel, `${rel}/index.html`, `${rel}.html`] : ["index.html"];
  for (const c of candidates) {
    const full = path.resolve(root, c);
    if (!full.startsWith(root + path.sep)) continue;
    const s = await stat(full).catch(() => null);
    if (s?.isFile()) {
      const ext = (/\.([a-z0-9]+)$/i.exec(full)?.[1] ?? "").toLowerCase();
      const type = TYPES[ext] ?? (/__[a-f0-9]{8}$/.test(full) ? "application/octet-stream" : "text/html; charset=utf-8");
      return { file: full, type };
    }
  }
  return null;
}

/** Bij het tonen van het voorbeeld: verwijzingen vanaf de root krijgen het voorbeeld-pad ervoor. */
export function prefixRootRefs(text: string, prefix: string, kind: "html" | "css"): string {
  const css = (s: string) =>
    s.replace(/url\(\s*(['"]?)\/(?!\/)/gi, `url($1${prefix}/`).replace(/@import\s+(['"])\/(?!\/)/gi, `@import $1${prefix}/`);
  if (kind === "css") return css(text);
  return css(
    text
      .replace(/(\s(?:href|src|poster|action|data-src|data-lazy-src)\s*=\s*["'])\/(?!\/)/gi, `$1${prefix}/`)
      .replace(/(\s(?:srcset|data-srcset)\s*=\s*["'])([^"']*)/gi, (_m, pre: string, v: string) => pre + v.replace(/(^|,\s*)\/(?!\/)/g, `$1${prefix}/`)),
  );
}

export async function readMirrorFile(file: string): Promise<Buffer> {
  return readFile(file);
}
