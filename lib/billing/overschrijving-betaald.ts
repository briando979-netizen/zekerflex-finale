import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { settleClawbacks } from "@/lib/billing/clawback";
import { bedragKlopt, bedragMelding, handmatigMelding, kanHandmatigBetaald } from "@/lib/billing/overschrijving-betaald-kern";

// De handeling bij "het geld staat op de rekening" (regels en uitleg: overschrijving-betaald-kern.ts).

export interface TeBetalenFactuur {
  number: string;
  /** het bedrijf dat de factuur kreeg; zo ziet de beheerder dat hij de goede factuur heeft */
  bedrijf: string | null;
  totalCents: number;
}

async function zoek(nummer: string) {
  const factuur = await prisma.invoice.findFirst({
    where: { number: nummer.trim() },
    select: { id: true, number: true, type: true, status: true, totalCents: true, recipientTenant: { select: { name: true } } },
  });
  if (!factuur) throw AppError.notFound("Er is geen factuur met dit nummer.");
  const mag = kanHandmatigBetaald(factuur);
  if (!mag.ok) {
    const tekst = handmatigMelding(mag.reden, factuur.number);
    throw mag.reden === "al-betaald" ? AppError.conflict(tekst) : AppError.validation(tekst);
  }
  return factuur;
}

/** Eerst kijken: welke factuur is dit, van welk bedrijf en voor welk bedrag. Schrijft niets. */
export async function bekijkTeBetalen(nummer: string): Promise<TeBetalenFactuur> {
  const f = await zoek(nummer);
  return { number: f.number, bedrijf: f.recipientTenant?.name ?? null, totalCents: f.totalCents };
}

/**
 * De beheerder meldt dat het geld van een factuur op de rekening staat, met het bedrag dat hij ontving. Alleen precies het
 * factuurbedrag sluit de factuur. De omzetting gebeurt in één stap op "nog open": twee keer klikken, of een betaling die
 * intussen via Stripe binnenkwam, geeft dus geen dubbele boeking. Daarna dezelfde afhandeling als bij Stripe voor deze
 * soort: openstaande terugvorderingen verrekenen en een regel in het auditlogboek.
 */
export async function meldBetaaldPerOverschrijving(nummer: string, ontvangenCents: number | null, actorUserId: string, nu: Date = new Date()): Promise<TeBetalenFactuur> {
  const factuur = await zoek(nummer);
  if (!bedragKlopt(ontvangenCents, factuur.totalCents)) throw AppError.validation(bedragMelding(factuur.number, factuur.totalCents));
  const gezet = await prisma.invoice.updateMany({ where: { id: factuur.id, status: "ISSUED" }, data: { status: "PAID", paidAt: nu } });
  if (gezet.count !== 1) throw AppError.conflict(`Factuur ${factuur.number} is intussen al verwerkt. Ververs de pagina.`);
  await settleClawbacks(factuur.id).catch((err) => logger.error("settling clawback failed", { invoiceId: factuur.id, error: (err as Error).message }));
  await recordAudit({
    category: "BILLING",
    action: "invoice.paid",
    actorUserId,
    actorLabel: "user",
    summary: `Factuur ${factuur.number} betaald per bankoverschrijving (gemeld door de beheerder)`,
    targetType: "invoice",
    targetId: factuur.id,
    metadata: { via: "overschrijving", bedragCents: factuur.totalCents },
  });
  return { number: factuur.number, bedrijf: factuur.recipientTenant?.name ?? null, totalCents: factuur.totalCents };
}
