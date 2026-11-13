import { randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { kvDelete, kvGet, kvListKeys, kvListValues, kvSet } from "@/lib/storage/kv";
import type { CleanImage } from "@/lib/media/clean-image";
import { LEGE_WINKEL, SECTOR_TEMPLATES, pagesFromTemplate, slugify, type Media, type SiteDoc, type SiteDomain, type SiteProposalMark, type SiteSoort } from "@/lib/sites/types";
import { webshopPages, webshopTemplate } from "@/lib/sites/webshop-templates";
import { ontwerpVoor } from "@/lib/sites/ontwerpen";
import type { createSchema, siteSaveSchema } from "@/lib/sites/schema";

// ---------------------------------------------------------------------------
// ZekerFlex Sites storage.
//   KV "site:<id>"                  — the site being edited
//   KV "site-tenant:<tenantId>"     — the website of a company (one)
//   KV "webshop-tenant:<tenantId>"  — the webshop of a company (one; a separate variant, same engine)
//   KV "site-slug:<slug>"           — claimed address part (unique key: first wins)
//   KV "site-build:<id>:<buildId>"  — a published snapshot; visitors see doc.liveBuild
//   KV "site-contact:<id>:<msgId>"  — messages sent through the contact form
//   KV "site-domain:<id>"           — the own domain (lib/sites/domain.ts)
//   KV "site-host:<host>"           — a claimed own domain → site id (first wins)
//   disk storage/sitebuilder/<id>/media/<mediaId>.webp — the photos
// Publishing freezes a snapshot, so editing never changes the live site until
// the next publish, and going back is one click.
// ---------------------------------------------------------------------------

export const SITE_BUILDER_DIR = process.env.SITE_BUILDER_DIR || path.join(process.cwd(), "storage", "sitebuilder");
const KEEP_BUILDS = 10;
// a shop with photos per product needs room (lib/sites/winkel.ts: up to 300 products)
const MAX_MEDIA = 600;

const siteKey = (id: string) => `site:${id}`;
const tenantKey = (tenantId: string, soort: SiteSoort = "website") => (soort === "webshop" ? `webshop-tenant:${tenantId}` : `site-tenant:${tenantId}`);
const slugKey = (slug: string) => `site-slug:${slug}`;
const buildKey = (id: string, buildId: string) => `site-build:${id}:${buildId}`;
const contactPrefix = (id: string) => `site-contact:${id}:`;

const rid = (prefix: string, n = 10) => `${prefix}${randomBytes(n).toString("hex").slice(0, n)}`;
export const isSiteId = (id: string) => /^s[a-z0-9]{6,20}$/.test(id);
// "-k": the small copy of a 4K photo (Media.klein)
const isMediaFile = (file: string) => /^m[a-z0-9]{6,20}(-k)?\.webp$/.test(file);

/** Snapshot of a published site (what visitors see). */
export type SiteSnapshot = Omit<SiteDoc, "builds" | "liveBuild">;

/** A published site as visitors get it, with its own domain (if linked) — that lives apart, so linking needs no new publish. */
export interface LiveSite {
  snapshot: SiteSnapshot;
  buildId: string;
  siteId: string;
  domein: SiteDomain | null;
}

/** KV key of a site's own domain (lib/sites/domain.ts writes it). */
export const domainKey = (siteId: string) => `site-domain:${siteId}`;

export async function getSite(id: string): Promise<SiteDoc | null> {
  return isSiteId(id) ? kvGet<SiteDoc>(siteKey(id)) : null;
}

/** De website (standaard) of de webshop van een bedrijf. */
export async function siteOfTenant(tenantId: string, soort: SiteSoort = "website"): Promise<SiteDoc | null> {
  const id = await kvGet<string>(tenantKey(tenantId, soort));
  return id ? getSite(id) : null;
}

/** Zet welke site van deze soort open staat voor het bedrijf (lib/sites/meer-sites.ts). Alleen voor een site van dat bedrijf. */
export async function zetActieveSite(tenantId: string, site: Pick<SiteDoc, "id" | "tenantId" | "soort">): Promise<void> {
  if (site.tenantId !== tenantId) throw AppError.forbidden("Deze site hoort niet bij je bedrijf.");
  await kvSet(tenantKey(tenantId, site.soort ?? "website"), site.id);
}

/**
 * De site waar de winkel van een bedrijf in zit: de webshop, en anders een website die al
 * producten heeft (zo werken de winkels die vóór de scheiding in een website zijn gemaakt gewoon door).
 */
export async function winkelSiteOf(tenantId: string): Promise<SiteDoc | null> {
  return (await siteOfTenant(tenantId, "webshop")) ?? (await siteOfTenant(tenantId, "website"));
}

async function claimSlug(base: string, siteId: string): Promise<string> {
  const stem = slugify(base).slice(0, 34) || "website";
  for (let n = 1; n <= 50; n++) {
    const slug = n === 1 ? (stem.length >= 3 ? stem : `${stem}-site`) : `${stem}-${n}`;
    try {
      await prisma.keyValueStore.create({ data: { key: slugKey(slug), value: siteId } });
      return slug;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
      throw err;
    }
  }
  throw AppError.conflict("Kon geen vrij webadres vinden; kies een andere naam.");
}

/**
 * `extra`: nog een site naast de bestaande (lib/sites/meer-sites.ts bewaart eerst de lijst met de bestaande sites). Zonder
 * `extra` blijft de regel: één site per soort, zoals elke andere aanroep verwacht.
 */
export async function createSite(tenantId: string, by: { userId: string; name: string }, input: z.infer<typeof createSchema>, opts: { extra?: boolean } = {}): Promise<SiteDoc> {
  const soort: SiteSoort = input.soort ?? "website";
  if (!opts.extra && (await siteOfTenant(tenantId, soort))) throw AppError.conflict(soort === "webshop" ? "Je bedrijf heeft al een webshop." : "Je bedrijf heeft al een website.");
  const shopTemplate = webshopTemplate(input.templateId);
  const template = soort === "webshop" ? shopTemplate : (SECTOR_TEMPLATES.find((t) => t.id === input.templateId) ?? SECTOR_TEMPLATES[0]!);
  const id = rid("s");
  const slug = await claimSlug(input.bedrijf.naam, id);
  const now = new Date().toISOString();
  // chosen in Studio → Ontwerpen: the style exactly as its example shows it
  const gekozen = input.ontwerp ? ontwerpVoor(soort, input.templateId) : null;
  const site: SiteDoc = {
    id,
    tenantId,
    ...(soort === "webshop" ? { soort } : {}),
    slug,
    // the house style for every new site: premium since 3 Nov 2026, beleving (exactly like schwarzwald.zekerflex.com) since 4 Nov; existing sites keep theirs.
    // A webshop starts in premium (white product cards on cream); the company can switch in Ontwerp.
    theme: gekozen ? { ...gekozen.thema } : { kleur: template.theme.kleur, accent: template.theme.accent, lettertype: "modern", hoeken: "rond", stijl: soort === "webshop" ? "premium" : "beleving" },
    bedrijf: input.bedrijf,
    pages: soort === "webshop" ? webshopPages(shopTemplate, input.bedrijf, () => rid("b", 8)) : pagesFromTemplate(template as (typeof SECTOR_TEMPLATES)[number], input.bedrijf, () => rid("b", 8)),
    ...(soort === "webshop" ? { winkel: LEGE_WINKEL } : {}),
    media: [],
    liveBuild: null,
    builds: [],
    createdAt: now,
    updatedAt: now,
  };
  await kvSet(siteKey(id), site);
  await kvSet(tenantKey(tenantId, soort), id);
  await recordAudit({ category: "SALES", action: "site.created", actorUserId: by.userId, summary: `${soort === "webshop" ? "Webshop" : "Website"} ${slug} aangemaakt (${template.naam})`, targetType: "site", targetId: id });
  return site;
}

export async function saveSite(id: string, input: z.infer<typeof siteSaveSchema>): Promise<SiteDoc> {
  const site = await getSite(id);
  if (!site) throw AppError.notFound("Deze website bestaat niet.");
  const known = new Set(site.media.map((m) => m.id));
  // photos must be ones this site owns
  if (input.theme.logo && !known.has(input.theme.logo)) throw AppError.validation("Het logo hoort niet bij deze website.");
  for (const p of input.pages)
    for (const b of p.blocks) {
      const ids = b.type === "hero" || b.type === "tekstFoto" ? [b.props.foto] : b.type === "galerij" ? b.props.fotos : b.type === "diensten" ? b.props.items.map((it) => it.foto ?? null) : [];
      if (ids.some((m) => m && !known.has(m))) throw AppError.validation("Een foto hoort niet bij deze website.");
    }
  if (input.winkel?.producten.some((p) => p.fotos.some((m) => !known.has(m)))) throw AppError.validation("Een productfoto hoort niet bij deze website.");
  if (input.altTexts) site.media = site.media.map((m) => (input.altTexts?.[m.id] !== undefined ? { ...m, alt: input.altTexts[m.id]! } : m));
  const next: SiteDoc = {
    ...site,
    theme: input.theme,
    bedrijf: input.bedrijf,
    pages: input.pages as SiteDoc["pages"],
    // the shop (lib/sites/winkel.ts): only when the builder sends it, so an older builder tab never wipes it
    ...(input.winkel ? { winkel: input.winkel } : {}),
    updatedAt: new Date().toISOString(),
  };
  await kvSet(siteKey(id), next);
  return next;
}

function mediaPath(siteId: string, file: string): string {
  if (!isSiteId(siteId) || !isMediaFile(file)) throw AppError.notFound("Deze foto bestaat niet.");
  return path.join(SITE_BUILDER_DIR, siteId, "media", file);
}

/** `klein`: a smaller copy of a large (up to 4K) photo, stored as <id>-k.webp for phones. */
export async function addMedia(siteId: string, image: CleanImage, meta: { alt: string; bron: Media["bron"]; sourceUrl?: string | undefined }, klein?: CleanImage | null): Promise<Media> {
  const site = await getSite(siteId);
  if (!site) throw AppError.notFound("Deze website bestaat niet.");
  if (site.media.length >= MAX_MEDIA) throw AppError.validation(`Een website kan ${MAX_MEDIA} foto's hebben; verwijder er eerst een paar.`);
  const id = rid("m", 12);
  const file = `${id}.webp`;
  const dir = path.join(SITE_BUILDER_DIR, siteId, "media");
  await mkdir(dir, { recursive: true });
  await writeFile(mediaPath(siteId, file), image.bytes);
  if (klein) await writeFile(mediaPath(siteId, `${id}-k.webp`), klein.bytes);
  const media: Media = {
    id,
    file,
    width: image.width,
    height: image.height,
    alt: meta.alt.slice(0, 200),
    bron: meta.bron,
    ...(meta.sourceUrl ? { sourceUrl: meta.sourceUrl.slice(0, 500) } : {}),
    ...(klein ? { klein: { width: klein.width, height: klein.height } } : {}),
  };
  site.media = [...site.media, media];
  site.updatedAt = new Date().toISOString();
  await kvSet(siteKey(siteId), site);
  return media;
}

export async function readMedia(siteId: string, file: string): Promise<Buffer> {
  try {
    return await readFile(mediaPath(siteId, file));
  } catch {
    throw AppError.notFound("Deze foto bestaat niet.");
  }
}

export async function publishSite(id: string, by: { userId: string; name: string }): Promise<SiteDoc> {
  const site = await getSite(id);
  if (!site) throw AppError.notFound("Deze website bestaat niet.");
  const buildId = `${Date.now().toString(36)}${rid("", 4)}`;
  const { builds, liveBuild, ...snapshot } = site;
  void liveBuild;
  await kvSet(buildKey(id, buildId), snapshot satisfies SiteSnapshot);
  const kept = [{ id: buildId, at: new Date().toISOString(), by: by.name }, ...builds];
  for (const old of kept.slice(KEEP_BUILDS)) await kvDelete(buildKey(id, old.id));
  const next: SiteDoc = { ...site, liveBuild: buildId, builds: kept.slice(0, KEEP_BUILDS) };
  await kvSet(siteKey(id), next);
  await recordAudit({ category: "SALES", action: "site.published", actorUserId: by.userId, summary: `Website ${site.slug} gepubliceerd`, targetType: "site", targetId: id });
  return next;
}

/** Mark a site as an example (lib/sites/demo.ts): the renderer shows a banner and the contact form sends nothing. */
export async function markExample(id: string): Promise<void> {
  const site = await getSite(id);
  if (site && !site.voorbeeld) await kvSet(siteKey(id), { ...site, voorbeeld: true });
}

/** Mark a site as a design proposal (lib/sales/website-proposal.ts), or take the mark off (null) once it is the company's own. Visitors see it after the next publish. */
export async function markProposal(id: string, mark: SiteProposalMark | null): Promise<void> {
  const site = await getSite(id);
  if (!site) throw AppError.notFound("Deze website bestaat niet.");
  const { voorstel, ...rest } = site;
  void voorstel;
  await kvSet(siteKey(id), mark ? { ...rest, voorstel: mark } : rest);
}

/**
 * Hand a site to a company (an accepted website proposal): it becomes that
 * company's site in the builder, without the proposal mark, and offline until
 * they publish it themselves (publishing needs Website-beheer). The old
 * snapshots go: rolling back to one would bring the proposal banner back.
 */
export async function transferSite(siteId: string, toTenantId: string, by: { userId: string; name: string }): Promise<SiteDoc> {
  const site = await getSite(siteId);
  if (!site) throw AppError.notFound("Deze website bestaat niet.");
  if (await siteOfTenant(toTenantId)) throw AppError.conflict("Dit bedrijf heeft al een website. Zet het voorstel niet over, maar neem de inhoud samen met ze door.");
  const { voorstel, builds, ...rest } = site;
  void voorstel;
  const next: SiteDoc = { ...rest, tenantId: toTenantId, liveBuild: null, builds: [], updatedAt: new Date().toISOString() };
  await kvSet(siteKey(siteId), next);
  await kvSet(tenantKey(toTenantId), siteId);
  if ((await kvGet<string>(tenantKey(site.tenantId))) === siteId) await kvDelete(tenantKey(site.tenantId));
  for (const b of builds) await kvDelete(buildKey(siteId, b.id));
  await recordAudit({ category: "SALES", action: "site.transferred", actorUserId: by.userId, summary: `Website ${site.slug} overgezet naar een bedrijf`, targetType: "site", targetId: siteId, metadata: { from: site.tenantId, to: toTenantId } });
  return next;
}

/** The tenant of a site the free website check made (lib/website-check/nieuwe-site.ts): a proposal nobody owns. */
export const isCheckProposalTenant = (tenantId: string) => tenantId.startsWith("voorstel:wc-");

/**
 * Remove a site the free website check made, once it has expired: its address,
 * snapshots, messages and photos on disk. Only such a site (its own tenant and
 * still a proposal): a company's site or a proposal from sales is never touched.
 */
export async function deleteCheckProposalSite(id: string): Promise<boolean> {
  const site = await getSite(id);
  if (!site || !site.voorstel || !isCheckProposalTenant(site.tenantId)) return false;
  for (const b of site.builds) await kvDelete(buildKey(id, b.id));
  for (const k of await kvListKeys(contactPrefix(id), 1000)) await kvDelete(k);
  if ((await kvGet<string>(slugKey(site.slug))) === id) await kvDelete(slugKey(site.slug));
  if ((await kvGet<string>(tenantKey(site.tenantId))) === id) await kvDelete(tenantKey(site.tenantId));
  await kvDelete(domainKey(id));
  await kvDelete(siteKey(id));
  // isSiteId guards the path: never anything outside storage/sitebuilder/<id>
  if (isSiteId(id)) await rm(path.join(SITE_BUILDER_DIR, id), { recursive: true, force: true });
  await recordAudit({ category: "SALES", action: "site.check-proposal-removed", actorUserId: null, summary: `Verlopen voorbeeldsite ${site.slug} van de gratis website-check opgeruimd`, targetType: "site", targetId: id });
  return true;
}

/** Give a site's address back (a withdrawn proposal), so a real company or a new proposal can have it. The site keeps its data. */
export async function freeSlug(siteId: string): Promise<void> {
  const site = await getSite(siteId);
  if (site && (await kvGet<string>(slugKey(site.slug))) === siteId) await kvDelete(slugKey(site.slug));
}

/** Go back to an earlier published version, or take the site offline (buildId null). */
export async function setLiveBuild(id: string, buildId: string | null, by: { userId: string; name: string }): Promise<SiteDoc> {
  const site = await getSite(id);
  if (!site) throw AppError.notFound("Deze website bestaat niet.");
  if (buildId !== null && !site.builds.some((b) => b.id === buildId)) throw AppError.notFound("Deze versie bestaat niet (meer).");
  const next = { ...site, liveBuild: buildId };
  await kvSet(siteKey(id), next);
  await recordAudit({ category: "SALES", action: buildId ? "site.rolled-back" : "site.offline", actorUserId: by.userId, summary: `Website ${site.slug} ${buildId ? `terug naar versie ${buildId}` : "offline gehaald"}`, targetType: "site", targetId: id });
  return next;
}

/**
 * The live snapshot of a site, or null while it is offline. The shop is the
 * exception to "visitors see the last publish": products, prices and stock come
 * from the site as it is now (Websitestudio → Producten), like any webshop.
 */
export async function liveSiteOf(site: SiteDoc | null): Promise<LiveSite | null> {
  if (!site?.liveBuild) return null;
  const [snapshot, domein] = await Promise.all([kvGet<SiteSnapshot>(buildKey(site.id, site.liveBuild)), kvGet<SiteDomain>(domainKey(site.id))]);
  if (!snapshot) return null;
  return { snapshot: site.winkel ? { ...snapshot, winkel: site.winkel } : snapshot, buildId: site.liveBuild, siteId: site.id, domein };
}

/** Only the shop (Websitestudio → Producten, Instellingen): live at once, the pages wait for a publish. */
export async function saveWinkel(id: string, winkel: NonNullable<SiteDoc["winkel"]>): Promise<SiteDoc> {
  const site = await getSite(id);
  if (!site) throw AppError.notFound("Deze website bestaat niet.");
  const known = new Set(site.media.map((m) => m.id));
  if (winkel.producten.some((p) => p.fotos.some((m) => !known.has(m)))) throw AppError.validation("Een productfoto hoort niet bij deze website.");
  // updatedAt stays: it tells the studio whether the pages have changes waiting for a publish
  const next: SiteDoc = { ...site, winkel };
  await kvSet(siteKey(id), next);
  return next;
}

/** The site that owns an address part, published or not. */
export async function siteBySlug(slug: string): Promise<SiteDoc | null> {
  if (!/^[a-z0-9-]{3,40}$/.test(slug)) return null;
  const siteId = await kvGet<string>(slugKey(slug));
  return siteId ? getSite(siteId) : null;
}

/** What a visitor of /site/<slug>/ gets: the live snapshot, or null. */
export async function liveSiteBySlug(slug: string): Promise<LiveSite | null> {
  if (!/^[a-z0-9-]{3,40}$/.test(slug)) return null;
  const siteId = await kvGet<string>(slugKey(slug));
  return liveSiteOf(siteId ? await getSite(siteId) : null);
}

export interface ContactMessage {
  id: string;
  at: string;
  naam: string;
  email: string;
  telefoon: string;
  bericht: string;
}

export async function storeContactMessage(siteId: string, msg: Omit<ContactMessage, "id" | "at">): Promise<ContactMessage> {
  const rec: ContactMessage = { ...msg, id: rid("c", 10), at: new Date().toISOString() };
  await kvSet(`${contactPrefix(siteId)}${rec.at}:${rec.id}`, rec);
  return rec;
}

export async function listContactMessages(siteId: string, limit = 200): Promise<ContactMessage[]> {
  const rows = await kvListValues<ContactMessage>(contactPrefix(siteId), limit);
  return rows.sort((a, b) => b.at.localeCompare(a.at));
}
