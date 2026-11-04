import type { DomeinBestelling, Invoice } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { nextInvoiceNumber } from "@/lib/billing/numbering";
import { BTW_PROCENT, metBtw } from "@/lib/domeinen/extensies";
import { isTestAdres, periodeTekst } from "@/lib/domeinen/verlengen-core";

// ---------------------------------------------------------------------------
// Facturen voor domeinnamen: gewone ZekerFlex-facturen (type DOMEIN, nummer
// ZF-DN-jaar-volgnummer) aan het bedrijf. Ze staan in Werkgever → Facturen,
// met pdf en betaallink, net als de platformfee. De klant ziet alleen
// ZekerFlex; welk register de naam vastlegt, staat nergens op de factuur.
// ---------------------------------------------------------------------------

export interface DomeinFactuurInvoer {
  bestelling: Pick<DomeinBestelling, "id" | "tenantId" | "domein" | "email">;
  soort: "eerste-jaar" | "verlenging";
  /** prijs per jaar excl. btw */
  exclCent: number;
  periodeVan: Date;
  periodeTot: Date;
  /** al betaald (de eerste bestelling via Stripe Checkout) of nog te betalen (verlenging) */
  betaald: { op: Date; stripeCheckoutSessionId?: string | null; stripePaymentIntentId?: string | null } | null;
  /** uiterste betaaldatum, alleen bij een open factuur */
  dueAt?: Date | undefined;
}

async function platformTenantId(): Promise<string> {
  const t = await prisma.tenant.findFirst({ where: { type: "PLATFORM" }, select: { id: true } });
  if (!t) throw AppError.precondition("Platform tenant is not configured");
  return t.id;
}

export function factuurRegel(domein: string, soort: DomeinFactuurInvoer["soort"], van: Date, tot: Date): string {
  return `Domeinnaam ${domein} — ${soort === "verlenging" ? "verlenging" : "registratie"}, 1 jaar (${periodeTekst(van, tot)})`;
}

/**
 * Maakt de factuur (met een gatloos nummer in dezelfde transactie). Een
 * testbestelling (testadres) krijgt een los ZF-TEST-nummer, zodat opruimen na
 * een livetest geen gat in de echte nummering slaat.
 */
export async function maakDomeinFactuur(input: DomeinFactuurInvoer): Promise<Invoice> {
  const p = metBtw(input.exclCent);
  const issuer = await platformTenantId();
  const nu = new Date();
  return prisma.$transaction(async (tx) => {
    const number = isTestAdres(input.bestelling.email) ? `ZF-TEST-${nu.getTime().toString(36).toUpperCase()}` : await nextInvoiceNumber(tx, "DOMEIN", nu);
    return tx.invoice.create({
      data: {
        number,
        type: "DOMEIN",
        status: input.betaald ? "PAID" : "ISSUED",
        issuerTenantId: issuer,
        recipientTenantId: input.bestelling.tenantId,
        domeinBestellingId: input.bestelling.id,
        currency: "EUR",
        vatTreatment: "STANDARD_RATE",
        vatRate: BTW_PROCENT / 100,
        subtotalCents: p.exclCent,
        vatCents: p.btwCent,
        totalCents: p.inclCent,
        issuedAt: nu,
        ...(input.dueAt ? { dueAt: input.dueAt } : {}),
        ...(input.betaald
          ? {
              paidAt: input.betaald.op,
              ...(input.betaald.stripeCheckoutSessionId ? { stripeCheckoutSessionId: input.betaald.stripeCheckoutSessionId } : {}),
              ...(input.betaald.stripePaymentIntentId ? { stripePaymentIntentId: input.betaald.stripePaymentIntentId } : {}),
            }
          : {}),
        lines: {
          create: [
            {
              description: factuurRegel(input.bestelling.domein, input.soort, input.periodeVan, input.periodeTot),
              quantity: 1,
              unitPriceCents: p.exclCent,
              amountCents: p.exclCent,
            },
          ],
        },
      },
    });
  });
}

/** De facturen van één domeinnaam, nieuwste eerst. */
export function facturenVan(domeinBestellingId: string) {
  return prisma.invoice.findMany({
    where: { domeinBestellingId, type: "DOMEIN" },
    orderBy: { createdAt: "desc" },
    select: { id: true, number: true, status: true, totalCents: true, dueAt: true, createdAt: true, stripePaymentIntentId: true },
  });
}
