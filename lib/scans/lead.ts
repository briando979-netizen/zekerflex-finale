import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { createLead } from "@/lib/sales/leads";
import { SOORT_LABEL, isTestHost, type ScanLog } from "@/lib/scans/model";

// ---------------------------------------------------------------------------
// Automatisch een lead bij elke gratis scan (eigenaar, 4 nov 2026): het bedrijf
// achter de gescande website komt in de sales-pijplijn, met wat de scan vond en
// de openbare contactgegevens van hun eigen site. Per website één lead: een
// volgende scan vult hem aan. Geen lead voor testadressen of onze eigen sites.
// Zo'n lead hoort bij geen campagne, dus de outreach-motor mailt hem nooit
// vanzelf (lib/sales/engine.ts eist een campagne en een vacaturesignaal).
// Vraagt de bezoeker zelf contact aan, dan wordt dezelfde lead warm (maakLeadWarm).
// ---------------------------------------------------------------------------

export interface ScanContact {
  naam?: string | null | undefined;
  email?: string | null | undefined;
  telefoon?: string | null | undefined;
  plaats?: string | null | undefined;
  kvk?: string | null | undefined;
  sourceUrl?: string | null | undefined;
}

const kaal = (host: string) => host.toLowerCase().replace(/^www\./, "");
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function scanRegel(log: ScanLog): string {
  const dag = new Date(log.at).toLocaleDateString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "short" });
  const base = env.APP_BASE_URL.replace(/\/+$/, "");
  return `[${dag}] ${SOORT_LABEL[log.soort]}: score ${log.score}/100, ${log.samenvatting}. Rapport: ${base}${log.rapport}`;
}

/** De lead van dit bedrijf (op hun websiteadres), of null. */
async function bestaandeLead(host: string): Promise<{ id: string; notes: string | null } | null> {
  const h = kaal(host);
  return prisma.salesLead.findFirst({
    where: { OR: [{ sourceUrl: { contains: `://${h}` } }, { sourceUrl: { contains: `://www.${h}` } }] },
    select: { id: true, notes: true },
    orderBy: { createdAt: "desc" },
  });
}

/** Maak of vul de lead van het gescande bedrijf; geeft het lead-id, of null (test, geen naam, of een storing). */
export async function autoLeadVoorScan(log: ScanLog, c: ScanContact): Promise<string | null> {
  if (isTestHost(log.host) || (!log.host && !c.naam)) return null;
  try {
    const regel = scanRegel(log);
    const bestaand = log.host ? await bestaandeLead(log.host) : null;
    if (bestaand) {
      if (!(bestaand.notes ?? "").includes(log.rapport)) {
        await prisma.salesLead.update({ where: { id: bestaand.id }, data: { notes: `${regel}\n${bestaand.notes ?? ""}`.slice(0, 2000) } });
      }
      return bestaand.id;
    }
    const lead = await createLead({
      companyName: (c.naam || log.naam).slice(0, 160),
      contactEmail: c.email && EMAIL.test(c.email) ? c.email.slice(0, 200) : undefined,
      contactPhone: c.telefoon ? c.telefoon.slice(0, 40) : undefined,
      city: c.plaats ? c.plaats.slice(0, 80) : undefined,
      kvkNumber: c.kvk && /^\d{8}$/.test(c.kvk) ? c.kvk : undefined,
      source: `scan-${log.soort}`,
      sourceUrl: c.sourceUrl ?? (log.host ? `https://${log.host}/` : undefined),
      notes: `${regel}\nAutomatisch aangemaakt bij een gratis scan; de bezoeker heeft (nog) geen contact gevraagd.`,
      createdById: null,
    });
    return lead.id;
  } catch (err) {
    logger.warn("scan: lead maken mislukt", { soort: log.soort, error: (err as Error).message.slice(0, 160) });
    return null;
  }
}

/** De bezoeker vraagt zelf contact aan: de lead van de scan wordt warm met zijn gegevens. Geeft false als er geen lead was. */
export async function maakLeadWarm(leadId: string | null, persoon: { naam: string; email?: string | null | undefined; telefoon?: string | null | undefined }, bron: string, notitie: string): Promise<boolean> {
  if (!leadId) return false;
  try {
    const lead = await prisma.salesLead.findUnique({ where: { id: leadId }, select: { notes: true } });
    if (!lead) return false;
    await prisma.salesLead.update({
      where: { id: leadId },
      data: {
        contactName: persoon.naam.slice(0, 120),
        ...(persoon.email ? { contactEmail: persoon.email.slice(0, 200) } : {}),
        ...(persoon.telefoon ? { contactPhone: persoon.telefoon.slice(0, 40) } : {}),
        source: bron,
        notes: `${notitie}\n${lead.notes ?? ""}`.slice(0, 2000),
      },
    });
    return true;
  } catch (err) {
    logger.warn("scan: lead warm maken mislukt", { error: (err as Error).message.slice(0, 160) });
    return false;
  }
}
