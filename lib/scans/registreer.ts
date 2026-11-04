import { logger } from "@/lib/logger";
import { templateFor } from "@/lib/sites/proposal-site";
import type { ReviewScanRapport } from "@/lib/review-scan/run";
import type { WebsiteCheckResult } from "@/lib/website-check/run";
import { maakDeal } from "@/lib/scans/deal";
import { autoLeadVoorScan } from "@/lib/scans/lead";
import { bewaarScanLog, getScanLog, koppel } from "@/lib/scans/store";
import { scanSleutel, type Branche, type ScanLog } from "@/lib/scans/model";

// ---------------------------------------------------------------------------
// Bij elke gratis scan (vanuit de openbare routes, niet bij interne metingen):
// het logboek, het voorstel op maat en — op de achtergrond — de lead. Dezelfde
// scan opnieuw (bewaard rapport) geeft hetzelfde voorstel. Faalt stil: een scan
// mag nooit mislukken door het logboek.
// ---------------------------------------------------------------------------

const TEMPLATE_BRANCHES = new Set<Branche>(["horeca", "bouw", "schoonmaak", "logistiek", "zorg", "algemeen"]);
export function brancheVan(tekst: string): Branche {
  if (/rijschool|autorijschool|rijles|driving school/i.test(tekst)) return "rijschool";
  const id = templateFor(tekst).id as Branche;
  return TEMPLATE_BRANCHES.has(id) ? id : "algemeen";
}

const meervoud = (n: number, een: string, meer: string) => `${n} ${n === 1 ? een : meer}`;

export async function registreerWebsiteCheck(r: WebsiteCheckResult): Promise<{ dealId: string | null }> {
  try {
    const bestaand = await getScanLog("website", r.id);
    if (bestaand) return { dealId: bestaand.dealId };
    const problemen = r.findings.filter((f) => f.status === "probleem");
    const letOp = r.findings.filter((f) => f.status === "let-op").length;
    const b = r.bedrijf;
    const naam = (b?.naam || r.host).slice(0, 120);
    let log: ScanLog = {
      sleutel: scanSleutel("website", r.id),
      soort: "website",
      scanId: r.id,
      at: r.at,
      host: r.host,
      naam,
      plaats: b?.plaats ?? null,
      score: r.score,
      samenvatting: `${meervoud(problemen.length, "probleem", "problemen")}, ${meervoud(letOp, "aandachtspunt", "aandachtspunten")}`,
      rapport: `/website-check?r=${r.id}`,
      leadId: null,
      dealId: null,
      siteSlug: null,
      stappen: [{ stap: "gescand", at: r.at }],
    };
    const deal = await maakDeal(log, {
      soort: "website",
      score: r.score,
      branche: brancheVan([naam, ...(b?.koppen ?? [])].join(" ")),
      naam,
      problemen: problemen.map((f) => f.title),
      probleemCategorieen: [...new Set(problemen.map((f) => String(f.category)))],
      reviewsOpSite: b?.reviews ?? false,
      googleRating: null,
      googleAantal: 0,
      nieuweSite: false,
    });
    log = { ...log, dealId: deal.id };
    await bewaarScanLog(log);
    void autoLeadVoorScan(log, { naam, email: b?.email, telefoon: b?.telefoon, plaats: b?.plaats, kvk: b?.kvk, sourceUrl: r.finalUrl }).then((leadId) => (leadId ? koppel("website", r.id, { leadId }) : undefined));
    return { dealId: deal.id };
  } catch (err) {
    logger.warn("scan: website-check niet in het logboek", { error: (err as Error).message.slice(0, 160) });
    return { dealId: null };
  }
}

export async function registreerReviewScan(r: ReviewScanRapport): Promise<{ dealId: string | null }> {
  try {
    const bestaand = await getScanLog("reviews", r.id);
    if (bestaand) return { dealId: bestaand.dealId };
    let host: string | null = null;
    try {
      host = r.bedrijf.website ? new URL(r.bedrijf.website).hostname : null;
    } catch {
      host = null;
    }
    const cijfer = r.rating !== null ? r.rating.toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : null;
    let log: ScanLog = {
      sleutel: scanSleutel("reviews", r.id),
      soort: "reviews",
      scanId: r.id,
      at: r.at,
      host,
      naam: r.bedrijf.naam.slice(0, 120),
      plaats: r.bedrijf.plaats,
      score: r.score,
      samenvatting: cijfer ? `${cijfer} op Google uit ${r.aantal.toLocaleString("nl-NL")} reviews` : "nog geen Google-reviews",
      rapport: `/review-check?r=${r.id}`,
      leadId: null,
      dealId: null,
      siteSlug: null,
      stappen: [{ stap: "gescand", at: r.at }],
    };
    const deal = await maakDeal(log, {
      soort: "reviews",
      score: r.score,
      branche: brancheVan(`${r.bedrijf.naam} ${r.bedrijf.categorie ?? ""}`),
      naam: log.naam,
      problemen: r.voorstellen.filter((v) => v.impact === "hoog").map((v) => v.titel),
      probleemCategorieen: [],
      reviewsOpSite: r.website?.reviewsOpSite ?? false,
      googleRating: r.rating,
      googleAantal: r.aantal,
      nieuweSite: false,
      heeftWebsite: Boolean(r.bedrijf.website),
    });
    log = { ...log, dealId: deal.id };
    await bewaarScanLog(log);
    void autoLeadVoorScan(log, { naam: log.naam, plaats: r.bedrijf.plaats, sourceUrl: r.bedrijf.website ?? r.bedrijf.mapsUrl }).then((leadId) => (leadId ? koppel("reviews", r.id, { leadId }) : undefined));
    return { dealId: deal.id };
  } catch (err) {
    logger.warn("scan: review-scan niet in het logboek", { error: (err as Error).message.slice(0, 160) });
    return { dealId: null };
  }
}
