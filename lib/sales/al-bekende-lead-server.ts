import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { alBekendeLeads, type LeadKort, type Overeenkomst, type PartnerBedrijf } from "@/lib/sales/al-bekende-lead";

// ---------------------------------------------------------------------------
// De leeskant van lib/sales/al-bekende-lead.ts: onze eigen leads ophalen en er de aangemelde bedrijven van de
// commissiepartners langs leggen. Alleen lezen, en een storing laat het scherm gewoon staan (dan geen waarschuwing).
// Alle leads in één keer: het zijn er enkele honderden en het scherm vergelijkt ze tegen alle registraties tegelijk.
// ---------------------------------------------------------------------------

/** Hoeveel leads we hoogstens vergelijken; ruim boven het echte aantal (154 op 27 nov 2026). */
const MAX_LEADS = 2000;

/**
 * Per aangemeld bedrijf de eigen leads die erop lijken, met het bedrijf als sleutel.
 * Een lege map betekent: niets gevonden of niet op te halen — dan staat er nergens een waarschuwing.
 */
export async function bekendeLeadsPerBedrijf(bedrijven: readonly (PartnerBedrijf & { id: string })[]): Promise<Map<string, Overeenkomst[]>> {
  const uit = new Map<string, Overeenkomst[]>();
  if (bedrijven.length === 0) return uit;
  let leads: LeadKort[] = [];
  try {
    leads = await prisma.salesLead.findMany({
      take: MAX_LEADS,
      orderBy: { createdAt: "desc" },
      select: { id: true, companyName: true, kvkNumber: true, contactEmail: true, discoveredEmail: true, status: true, source: true, createdAt: true },
    });
  } catch (e) {
    logger.warn("eigen leads niet opgehaald voor de partnerwaarschuwing", { error: (e as Error).message });
    return uit;
  }
  for (const b of bedrijven) {
    const gevonden = alBekendeLeads(b, leads);
    if (gevonden.length > 0) uit.set(b.id, gevonden);
  }
  return uit;
}
