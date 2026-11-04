import { randomBytes } from "node:crypto";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { buildProposalSite } from "@/lib/sites/proposal-site";
import { getSite } from "@/lib/sites/store";
import { scoreFindings } from "@/lib/website-check/analyze";
import { FetchError, fetchPage } from "@/lib/website-check/fetch";
import { extractBusiness } from "@/lib/website-check/proposal";
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
// ---------------------------------------------------------------------------

export const NIEUWE_SITE_DAGEN = 30;

/** Wat een voorstel bewust anders doet (noindex, geen robots.txt-regels en geen LocalBusiness), telt niet mee in "na". */
const ALLEEN_VOORSTEL = new Set(["noindex", "robots", "jsonld"]);

const KEY = (host: string) => `website-check-site:${host.toLowerCase()}`;
const geldig = (s: NieuweSite | null | undefined, now = Date.now()): s is NieuweSite => Boolean(s && Date.parse(s.verloopt) > now);

/** Een site van ZekerFlex zelf krijgt geen nieuwe site. */
export const isEigenSite = (host: string) => /(^|\.)zekerflex\.(com|nl)$/i.test(host);

/** De nieuwe site die al voor deze website klaarstaat, als hij nog geldig is en nog een voorstel is. */
async function bestaande(host: string): Promise<NieuweSite | null> {
  const s = await kvGet<NieuweSite>(KEY(host)).catch(() => null);
  if (!geldig(s)) return null;
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

/** Maak (of geef terug) de nieuwe website bij een check. */
export async function maakNieuweSite(checkId: string): Promise<{ check: WebsiteCheckResult; site: NieuweSite }> {
  const check = await getWebsiteCheck(checkId);
  if (!check) throw AppError.validation("Dit rapport bestaat niet meer. Doe de check opnieuw.");
  if (isEigenSite(check.host)) throw AppError.validation("Dit is een website van ZekerFlex zelf.");
  if (geldig(check.nieuweSite)) return { check, site: check.nieuweSite };

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
  const facts = extractBusiness(html, finalUrl);
  const now = new Date();
  const verloopt = new Date(now.getTime() + NIEUWE_SITE_DAGEN * 86_400_000).toISOString();
  const doc = await buildProposalSite({
    proposalId: `wc-${randomBytes(9).toString("hex")}`,
    facts,
    lead: { naam: null, plaats: null, kvk: null, sector: null },
    mark: { officieel: check.host, verloopt },
    by: { userId: "systeem", name: "Gratis website-check" },
  });
  const site: NieuweSite = { siteId: doc.id, slug: doc.slug, at: now.toISOString(), verloopt, score: await meet(doc.slug) };
  await kvSet(KEY(check.host), site);
  await markCheckSite(check.id, site);
  logger.info("website check new site", { host: check.host, slug: site.slug, score: site.score });
  return { check: { ...check, nieuweSite: site }, site };
}
