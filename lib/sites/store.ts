import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { kvDelete, kvGet, kvListValues, kvSet } from "@/lib/storage/kv";
import type { CleanImage } from "@/lib/media/clean-image";
import { SECTOR_TEMPLATES, pagesFromTemplate, slugify, type Media, type SiteDoc, type SiteDomain, type SiteProposalMark } from "@/lib/sites/types";
import type { createSchema, siteSaveSchema } from "@/lib/sites/schema";

// ---------------------------------------------------------------------------
// ZekerFlex Sites storage.
//   KV "site:<id>"                  — the site being edited
//   KV "site-tenant:<tenantId>"     — the site of a company (one for now)
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
const MAX_MEDIA = 200;

const siteKey = (id: string) => `site:${id}`;
const tenantKey = (tenantId: string) => `site-tenant:${tenantId}`;
const slugKey = (slug: string) => `site-slug:${slug}`;
const buildKey = (id: string, buildId: string) => `site-build:${id}:${buildId}`;
const contactPrefix = (id: string) => `site-contact:${id}:`;

const rid = (prefix: string, n = 10) => `${prefix}${randomBytes(n).toString("hex").slice(0, n)}`;
export const isSiteId = (id: string) => /^s[a-z0-9]{6,20}$/.test(id);
const isMediaFile = (file: string) => /^m[a-z0-9]{6,20}\.webp$/.test(file);

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

export async function siteOfTenant(tenantId: string): Promise<SiteDoc | null> {
  const id = await kvGet<string>(tenantKey(tenantId));
  return id ? getSite(id) : null;
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

export async function createSite(tenantId: string, by: { userId: string; name: string }, input: z.infer<typeof createSchema>): Promise<SiteDoc> {
  if (await siteOfTenant(tenantId)) throw AppError.conflict("Je bedrijf heeft al een website.");
  const template = SECTOR_TEMPLATES.find((t) => t.id === input.templateId) ?? SECTOR_TEMPLATES[0]!;
  const id = rid("s");
  const slug = await claimSlug(input.bedrijf.naam, id);
  const now = new Date().toISOString();
  const site: SiteDoc = {
    id,
    tenantId,
    slug,
    theme: { kleur: template.theme.kleur, accent: template.theme.accent, lettertype: "modern", hoeken: "rond" },
    bedrijf: input.bedrijf,
    pages: pagesFromTemplate(template, input.bedrijf, () => rid("b", 8)),
    media: [],
    liveBuild: null,
    builds: [],
    createdAt: now,
    updatedAt: now,
  };
  await kvSet(siteKey(id), site);
  await kvSet(tenantKey(tenantId), id);
  await recordAudit({ category: "SALES", action: "site.created", actorUserId: by.userId, summary: `Website ${slug} aangemaakt (${template.naam})`, targetType: "site", targetId: id });
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
      const ids = b.type === "hero" || b.type === "tekstFoto" ? [b.props.foto] : b.type === "galerij" ? b.props.fotos : [];
      if (ids.some((m) => m && !known.has(m))) throw AppError.validation("Een foto hoort niet bij deze website.");
    }
  if (input.altTexts) site.media = site.media.map((m) => (input.altTexts?.[m.id] !== undefined ? { ...m, alt: input.altTexts[m.id]! } : m));
  const next: SiteDoc = { ...site, theme: input.theme, bedrijf: input.bedrijf, pages: input.pages as SiteDoc["pages"], updatedAt: new Date().toISOString() };
  await kvSet(siteKey(id), next);
  return next;
}

function mediaPath(siteId: string, file: string): string {
  if (!isSiteId(siteId) || !isMediaFile(file)) throw AppError.notFound("Deze foto bestaat niet.");
  return path.join(SITE_BUILDER_DIR, siteId, "media", file);
}

export async function addMedia(siteId: string, image: CleanImage, meta: { alt: string; bron: Media["bron"]; sourceUrl?: string | undefined }): Promise<Media> {
  const site = await getSite(siteId);
  if (!site) throw AppError.notFound("Deze website bestaat niet.");
  if (site.media.length >= MAX_MEDIA) throw AppError.validation(`Een website kan ${MAX_MEDIA} foto's hebben; verwijder er eerst een paar.`);
  const id = rid("m", 12);
  const file = `${id}.webp`;
  const dir = path.join(SITE_BUILDER_DIR, siteId, "media");
  await mkdir(dir, { recursive: true });
  await writeFile(mediaPath(siteId, file), image.bytes);
  const media: Media = { id, file, width: image.width, height: image.height, alt: meta.alt.slice(0, 200), bron: meta.bron, ...(meta.sourceUrl ? { sourceUrl: meta.sourceUrl.slice(0, 500) } : {}) };
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

/** The live snapshot of a site, or null while it is offline. */
export async function liveSiteOf(site: SiteDoc | null): Promise<LiveSite | null> {
  if (!site?.liveBuild) return null;
  const [snapshot, domein] = await Promise.all([kvGet<SiteSnapshot>(buildKey(site.id, site.liveBuild)), kvGet<SiteDomain>(domainKey(site.id))]);
  return snapshot ? { snapshot, buildId: site.liveBuild, siteId: site.id, domein } : null;
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
