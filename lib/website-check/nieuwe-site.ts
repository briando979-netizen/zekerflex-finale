import { randomBytes } from "node:crypto";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { recordCronRun } from "@/lib/metrics";
import { kvDelete, kvGet, kvListEntries, kvListValues, kvSet } from "@/lib/storage/kv";
import { buildProposalSite } from "@/lib/sites/proposal-site";
import { deleteCheckProposalSite, getSite, isCheckProposalTenant, publishSite, saveSite } from "@/lib/sites/store";
import { siteSaveSchema } from "@/lib/sites/schema";
import { MOTOR, isStijlKeuze, motorVan, paletVan, type Overgenomen } from "@/lib/website-check/stijl-keuze";
import type { SiteDoc } from "@/lib/sites/types";
import { scoreFindings } from "@/lib/website-check/analyze";
import { FetchError, fetchPage } from "@/lib/website-check/fetch";
import { leesHeleSite } from "@/lib/website-check/inlezen-site";
import { getWebsiteCheck, markCheckSite, runWebsiteCheck, type NieuweSite, type WebsiteCheckResult } from "@/lib/website-check/run";

// ---------------------------------------------------------------------------
// Gratis website-check → "Maak mijn nieuwe website" (4 nov 2026): van de
// gecheckte site maakt ZekerFlex meteen een nieuwe in de stijl beleving, precies
// zoals schwarzwald.zekerflex.com, met hun eigen naam, teksten, foto's en logo
// (dezelfde motor als de websitevoorstellen van sales, lib/sites/proposal-site.ts).
// Het blijft een ontwerpvoorstel: een band "niet de officiële website", noindex,
// geen bedrijfsgegevens voor Google, een formulier dat niets verstuurt, na 30
// dagen weg. Er wordt niets gemaild: de bezoeker vroeg er zelf om en ziet hem op
// het scherm. Eén site per website tegelijk; wie dezelfde site opnieuw checkt,
// krijgt die terug.
//   KV "website-check-site:<host>" — de nieuwe site van een website (zolang hij geldig is)
// Elke nacht ruimt ruimVerlopenSitesOp ze een week na het verlopen op, met de
// foto's op schijf (cron "website-check-opruimen").
// ---------------------------------------------------------------------------

export const NIEUWE_SITE_DAGEN = 30;
/** Zo lang na het verlopen toont de link nog "verlopen" (in een lead of een gedeeld rapport), daarna gaat hij weg. */
export const OPRUIM_NA_DAGEN = 7;

/** Wat een voorstel bewust anders doet (noindex, geen robots.txt-regels en geen LocalBusiness), telt niet mee in "na". */
const ALLEEN_VOORSTEL = new Set(["noindex", "robots", "jsonld"]);

const KEY = (host: string) => `website-check-site:${host.toLowerCase()}`;
const geldig = (s: NieuweSite | null | undefined, now = Date.now()): s is NieuweSite => Boolean(s && Date.parse(s.verloopt) > now);

/** Een site van ZekerFlex zelf krijgt geen nieuwe site. */
export const isEigenSite = (host: string) => /(^|\.)zekerflex\.(com|nl)$/i.test(host);

/** Gemaakt met een oudere motor (lib/website-check/stijl-keuze.ts MOTOR): die mag op verzoek opnieuw. */
export const oudeMotor = (s: NieuweSite) => motorVan(s) < MOTOR;

/** De nieuwe site die al voor deze website klaarstaat, als hij nog geldig is, nog een voorstel is en met de huidige motor gemaakt. */
async function bestaande(host: string): Promise<NieuweSite | null> {
  const s = await kvGet<NieuweSite>(KEY(host)).catch(() => null);
  if (!geldig(s) || oudeMotor(s)) return null;
  const site = await getSite(s.siteId).catch(() => null);
  return site?.voorstel ? s : null;
}

/** De nieuwe site gemeten met dezelfde check als hun huidige; null als dat even niet lukt. */
async function meet(slug: string): Promise<number | null> {
  try {
    const url = `${env.APP_BASE_URL.replace(/\/+$/, "")}/site/${slug}?meting=${Date.now().toString(36)}`;
    const r = await runWebsiteCheck(url);
    return scoreFindings(r.findings.filter((f) => !ALLEEN_VOORSTEL.has(f.id))).score;
  } catch (err) {
    logger.info("website check new site not measured", { slug, reason: String(err) });
    return null;
  }
}

/**
 * Ruimt de voorbeeldsites van de gratis check op die langer dan OPRUIM_NA_DAGEN verlopen zijn:
 * adres, versies, berichten en foto's (lib/sites/store.ts deleteCheckProposalSite raakt
 * alleen zulke sites, nooit die van een bedrijf of een voorstel van sales).
 */
export async function ruimVerlopenSitesOp(now = Date.now()): Promise<{ opgeruimd: number }> {
  const grens = now - OPRUIM_NA_DAGEN * 86_400_000;
  const sites = await kvListValues<SiteDoc>("site:", 5000);
  let opgeruimd = 0;
  for (const s of sites) {
    if (!s || typeof s.id !== "string" || typeof s.tenantId !== "string" || !isCheckProposalTenant(s.tenantId) || !s.voorstel) continue;
    if (!(Date.parse(s.voorstel.verloopt) < grens)) continue;
    if (await deleteCheckProposalSite(s.id)) opgeruimd++;
  }
  // de verwijzing per website gaat mee (een nieuwe check bouwt dan gewoon een nieuwe site)
  for (const { key, value } of await kvListEntries<NieuweSite>("website-check-site:", 5000)) {
    if (!value || !(Date.parse(value.verloopt) >= grens)) await kvDelete(key);
  }
  recordCronRun("website-check-opruimen", true);
  if (opgeruimd) logger.info("website check sites removed", { opgeruimd });
  return { opgeruimd };
}

/** Maak (of geef terug) de nieuwe website bij een check. */
export async function maakNieuweSite(checkId: string): Promise<{ check: WebsiteCheckResult; site: NieuweSite }> {
  const check = await getWebsiteCheck(checkId);
  if (!check) throw AppError.validation("Dit rapport bestaat niet meer. Doe de check opnieuw.");
  if (isEigenSite(check.host)) throw AppError.validation("Dit is een website van ZekerFlex zelf.");
  if (geldig(check.nieuweSite) && !oudeMotor(check.nieuweSite)) return { check, site: check.nieuweSite };

  const klaar = await bestaande(check.host);
  if (klaar) {
    await markCheckSite(check.id, klaar);
    return { check: { ...check, nieuweSite: klaar }, site: klaar };
  }

  let html: string;
  let finalUrl: string;
  try {
    const page = await fetchPage(check.finalUrl, { timeoutMs: 12_000 });
    html = page.body;
    finalUrl = page.finalUrl;
  } catch (err) {
    if (err instanceof FetchError) throw AppError.validation(`We konden je website nu niet openen: ${err.message}`);
    throw err;
  }
  // de hele site (homepage + over ons, aanbod, werk, contact …) en Google, niet alleen de homepage
  const facts = await leesHeleSite({ body: html, finalUrl });
  const now = new Date();
  const verloopt = new Date(now.getTime() + NIEUWE_SITE_DAGEN * 86_400_000).toISOString();
  const doc = await buildProposalSite({
    proposalId: `wc-${randomBytes(9).toString("hex")}`,
    facts,
    lead: { naam: null, plaats: null, kvk: null, sector: null },
    mark: { officieel: check.host, verloopt },
    by: { userId: "systeem", name: "Gratis website-check" },
  });
  const overgenomen: Overgenomen = {
    paginas: facts.paginas.length,
    fotos: doc.media.filter((m) => m.id !== doc.theme.logo).length,
    diensten: facts.secties.length,
    uren: facts.uren.length > 0,
    vragen: facts.faq.length,
    klantverhalen: facts.getuigenissen.length,
    google: facts.google?.rating ?? null,
  };
  const site: NieuweSite = {
    siteId: doc.id,
    slug: doc.slug,
    at: now.toISOString(),
    verloopt,
    score: await meet(doc.slug),
    motor: MOTOR,
    overgenomen,
    stijl: doc.theme.stijl ?? "beleving",
    palet: "eigen",
    eigen: { kleur: doc.theme.kleur, accent: doc.theme.accent },
  };
  await kvSet(KEY(check.host), site);
  await markCheckSite(check.id, site);
  logger.info("website check new site", { host: check.host, slug: site.slug, score: site.score, ...overgenomen });
  return { check: { ...check, nieuweSite: site }, site };
}

/**
 * Meer opties: een andere stijl of andere kleuren voor de nieuwe website van een check. Raakt alleen een
 * voorbeeldsite van de gratis check die nog geldig is (tenant "voorstel:wc-…"), nooit de site van een
 * bedrijf of een voorstel van sales: de check-id in de link is de sleutel.
 */
export async function kiesStijl(checkId: string, stijl: unknown, paletId: unknown): Promise<NieuweSite> {
  if (!isStijlKeuze(stijl)) throw AppError.validation("Kies een van de stijlen.");
  const palet = paletVan(paletId);
  if (!palet) throw AppError.validation("Kies een van de kleuren.");
  const check = await getWebsiteCheck(checkId);
  if (!check) throw AppError.validation("Dit rapport bestaat niet meer. Doe de check opnieuw.");
  const ns = check.nieuweSite;
  if (!geldig(ns)) throw AppError.validation("Deze nieuwe website is verlopen. Maak hem opnieuw.");
  const doc = await getSite(ns.siteId);
  if (!doc || !isCheckProposalTenant(doc.tenantId) || !doc.voorstel) throw AppError.notFound("Deze website bestaat niet (meer).");
  const eigen = ns.eigen ?? { kleur: doc.theme.kleur, accent: doc.theme.accent };
  const theme = { ...doc.theme, stijl, kleur: palet.kleur ?? eigen.kleur, accent: palet.accent ?? eigen.accent };
  await saveSite(doc.id, siteSaveSchema.parse({ theme, bedrijf: doc.bedrijf, pages: doc.pages }));
  await publishSite(doc.id, { userId: "systeem", name: "Gratis website-check" });
  const next: NieuweSite = { ...ns, stijl, palet: palet.id, eigen };
  await kvSet(KEY(check.host), next);
  await markCheckSite(check.id, next);
  return next;
}
