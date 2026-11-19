import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { alertOwner } from "@/lib/ops/alert";
import { anyPlatformAdmin } from "@/lib/messaging/contacts";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { leadWebsiteUrl } from "@/lib/sales/website-score-shared";
import { createWebsiteProposal } from "@/lib/sales/website-proposal";
import { heeftHandgemaaktVoorstel } from "@/lib/sales/handgemaakte-voorstellen";
import { FREE_MAIL_DOMAINS } from "@/lib/sales/vrije-maildomeinen";

// ---------------------------------------------------------------------------
// Automatische websitepijplijn (18 nov 2026).
//
// De dunne lijm die een GEVONDEN lead (via OSM/KVK, met een bekende website)
// vanzelf door de bestaande voorstel-motor haalt: de site scannen, een rapport
// met "wat kan beter + wat wij bouwen" maken en er een nieuwe luxe voorbeeldsite
// bij bouwen (createWebsiteProposal → status "concept"). Daarna krijgt de
// eigenaar één samenvatting per dag (alertOwner) met de nieuwe voorstellen.
//
// Deze motor VERSTUURT NOOIT iets naar een bedrijf: hij zet alleen concepten
// klaar. Een mens opent het voorstel in Admin → Websitevoorstellen en verstuurt
// het met één klik (verstuurWebsitevoorstelMail). Zo blijft de regel uit
// AGENTS.md overeind "een voorstel mailt nooit vanzelf (een mens verstuurt)".
//
// Draait achter de vlag "sales-website-pijplijn" (standaard uit): de cron-route
// doet niets zolang die uit staat.
// ---------------------------------------------------------------------------

export const PIJPLIJN_FLAG = "sales-website-pijplijn";
/** Hooguit zoveel nieuwe voorstellen per ronde: elk bouwt een hele site + leest de echte site (zwaar). */
export const PIJPLIJN_CAP = 3;
/** Zoveel leads hooguit bekijken om genoeg nieuwe te vinden (een lead met een lopend voorstel is goedkoop over te slaan). */
const MAX_BEKEKEN = 120;

const CLOSED = ["WON", "LOST", "DISQUALIFIED", "BOUNCED", "UNSUBSCRIBED"] as const;
const isTestHost = (host: string) => host === "localhost" || /\.(test|example|invalid|localhost)$/i.test(host);

/** Hoort dit webadres al bij een ZekerFlex-klant (een actief account op het bedrijfsdomein)? Dan geen koud voorstel. */
async function domeinIsKlant(host: string): Promise<boolean> {
  const domein = host.trim().toLowerCase().replace(/^www\./, "");
  if (!domein.includes(".") || FREE_MAIL_DOMAINS.has(domein)) return false;
  const klant = await prisma.user
    .findFirst({ where: { email: { endsWith: `@${domein}` }, disabledAt: null }, select: { id: true } })
    .catch(() => null);
  return Boolean(klant);
}

export interface PijplijnItem {
  leadId: string;
  bedrijf: string;
  host: string;
  score: number;
  /** de belangrijkste verbeterpunten (titels), hooguit drie */
  punten: string[];
  proposalId: string;
  url: string;
  /** het e-mailadres waarnaar de eigenaar met één klik kan versturen, of null */
  email: string | null;
}

export interface PijplijnResult {
  gemaakt: PijplijnItem[];
  overgeslagen: number;
  mislukt: number;
}

/**
 * Loop open leads met een bekende website langs en maak voor hooguit `limit`
 * ervan een websitevoorstel (concept). Slaat leads over die al een lopend
 * voorstel hebben, een testadres zijn, of waarvan de site niet te lezen is.
 */
export async function runWebsitePijplijn(opts: { limit?: number } = {}): Promise<PijplijnResult> {
  const limit = Math.max(1, Math.min(opts.limit ?? PIJPLIJN_CAP, 10));
  const adminId = await anyPlatformAdmin();
  if (!adminId) {
    logger.warn("website-pijplijn: geen platformbeheerder om voorstellen aan toe te schrijven");
    return { gemaakt: [], overgeslagen: 0, mislukt: 0 };
  }
  const by = { userId: adminId, name: "Automatische pijplijn" };

  const leads = await prisma.salesLead.findMany({
    where: { sourceUrl: { startsWith: "http" }, status: { notIn: [...CLOSED] }, suppressed: false },
    orderBy: { createdAt: "desc" },
    take: MAX_BEKEKEN,
    select: { id: true, companyName: true, sourceUrl: true, contactEmail: true, discoveredEmail: true },
  });

  const result: PijplijnResult = { gemaakt: [], overgeslagen: 0, mislukt: 0 };
  const basis = env.APP_BASE_URL.replace(/\/+$/, "");

  for (const lead of leads) {
    if (result.gemaakt.length >= limit) break;
    const url = leadWebsiteUrl(lead.sourceUrl);
    if (!url) continue;
    let host: string;
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch {
      continue;
    }
    if (isTestHost(host) || /(^|\.)zekerflex\.(com|nl)$/i.test(host)) {
      result.overgeslagen += 1;
      continue;
    }
    // Voor dit bedrijf loopt al een handgemaakt voorstel (bv. een partner als Smileyapp/Martijn): nooit een tweede, automatisch voorstel ernaast.
    if (heeftHandgemaaktVoorstel(host)) {
      result.overgeslagen += 1;
      continue;
    }
    // Al klant (een actief account op het bedrijfsdomein): geen koud websitevoorstel.
    if (await domeinIsKlant(host)) {
      result.overgeslagen += 1;
      continue;
    }
    try {
      const proposal = await createWebsiteProposal({ leadId: lead.id }, by);
      result.gemaakt.push({
        leadId: lead.id,
        bedrijf: proposal.bedrijf,
        host: proposal.host,
        score: proposal.check.score,
        punten: proposal.punten.filter((p) => p.status === "probleem").concat(proposal.punten).slice(0, 3).map((p) => p.titel),
        proposalId: proposal.id,
        url: `${basis}/websitevoorstel/${proposal.id}`,
        email: lead.contactEmail || lead.discoveredEmail || null,
      });
    } catch (err) {
      // Een lopend voorstel (conflict) of een onleesbare/ongeldige site (validation): gewoon overslaan.
      if (err instanceof AppError) {
        result.overgeslagen += 1;
      } else {
        result.mislukt += 1;
        logger.warn("website-pijplijn: voorstel mislukt", { leadId: lead.id, error: (err as Error).message });
      }
    }
  }

  logger.info("website-pijplijn klaar", { gemaakt: result.gemaakt.length, overgeslagen: result.overgeslagen, mislukt: result.mislukt });
  return result;
}

/**
 * Eén samenvatting per dag naar de eigenaar met de nieuwe voorstellen. Alleen
 * als er iets gemaakt is (geen mail op een lege dag). Gaat via alertOwner, dus
 * naar de pushmelding van de beheerders én naar MAIL_ADMIN.
 */
export async function stuurPijplijnDagoverzicht(result: PijplijnResult, now = new Date()): Promise<void> {
  if (result.gemaakt.length === 0) return;
  const basis = env.APP_BASE_URL.replace(/\/+$/, "");
  const regels = result.gemaakt
    .map((i) => `• ${i.bedrijf} (${i.host}) — huidige site ${i.score}/100${i.punten[0] ? `. Grootste punt: ${i.punten[0]}` : ""}\n  ${i.url}`)
    .join("\n");
  const aantal = result.gemaakt.length;
  await alertOwner(
    {
      key: `sales-pijplijn:${amsterdamDayKey(now)}`,
      severity: "warning",
      title: `${aantal} nieuw${aantal === 1 ? "" : "e"} websitevoorstel${aantal === 1 ? "" : "len"} staan klaar`,
      detail:
        `De automatische pijplijn heeft ${aantal} bedrijf${aantal === 1 ? "" : "ven"} gescand en er een rapport met nieuwe website voor klaargezet:\n\n` +
        `${regels}\n\n` +
        `Open elk voorstel, bekijk de nieuwe site en verstuur hem met één klik ("Verstuur naar het bedrijf"). Er is nog niets naar de bedrijven gestuurd: dat doe jij.\n` +
        `Alles op een rij: ${basis}/admin/websitevoorstellen`,
      url: "/admin/websitevoorstellen",
    },
    now.getTime(),
  );
}
