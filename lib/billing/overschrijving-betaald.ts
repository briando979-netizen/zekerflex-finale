import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { settleClawbacks } from "@/lib/billing/clawback";
import { handmatigMelding, kanHandmatigBetaald } from "@/lib/billing/overschrijving-betaald-kern";

/**
 * De beheerder meldt dat het geld van een factuur op de rekening staat (regel en uitleg: overschrijving-betaald-kern.ts).
 * De omzetting gebeurt in één stap op "nog open": twee keer klikken, of een betaling die intussen via Stripe binnenkwam,
 * geeft dus geen dubbele boeking. Daarna dezelfde afhandeling als bij Stripe voor deze soort: openstaande terugvorderingen
 * verrekenen en een regel in het auditlogboek.
 */
export async function meldBetaaldPerOverschrijving(nummer: string, actorUserId: string, nu: Date = new Date()): Promise<{ number: string; totalCents: number }> {
  const factuur = await prisma.invoice.findFirst({ where: { number: nummer.trim() }, select: { id: true, number: true, type: true, status: true, totalCents: true } });
  if (!factuur) throw AppError.notFound("Er is geen factuur met dit nummer.");
  const mag = kanHandmatigBetaald(factuur);
  if (!mag.ok) {
    const tekst = handmatigMelding(mag.reden, factuur.number);
    throw mag.reden === "al-betaald" ? AppError.conflict(tekst) : AppError.validation(tekst);
  }
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
    metadata: { via: "overschrijving" },
  });
  return { number: factuur.number, totalCents: factuur.totalCents };
}
