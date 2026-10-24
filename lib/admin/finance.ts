import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { getFinanceSettings, type FinanceSettings } from "@/lib/admin/finance-settings";

// ---------------------------------------------------------------------------
// Financieel overzicht voor de eigenaar: eigen omzet (marge) losgetrokken van
// doorlopende posten (uitzendloon, freelancer-facturen), btw-positie, kosten,
// reserveringen en "uitkeerbaar" (wat je naar de holding/privé kunt halen).
//
// Alleen de ECHTE factuurdata is hard: platformfee en de uitzendopslag zijn
// jouw marge, het uitzendloon en de freelancer-facturen stromen door. Btw,
// kosten en belasting zijn indicatieve reserveringen op basis van je eigen
// instelbare tarieven — laat je boekhouder ze bevestigen.
// ---------------------------------------------------------------------------

const DAY = 86_400_000;

export interface FinanceOverview {
  from: string;
  to: string;
  months: number;
  revenue: {
    platformFee: number; // volledige platformkosten (€/uur)
    uitzendMargin: number; // alleen de opslag (loon is doorloop)
    total: number; // jouw omzet (marge)
  };
  passthrough: {
    uitzendWages: number; // loon dat naar uitzendkrachten gaat
    freelancerInvoices: number; // facturen namens freelancers (reverse billing)
    penalties: number; // annulerings-/no-show-claims (gaan naar de benadeelde partij)
    total: number;
  };
  grossInvoiced: number; // totaal gefactureerd incl. doorloop en btw
  vat: {
    output: number; // btw op jouw verkoopfacturen
    inputEstimate: number; // geschatte voorbelasting op je kosten
    due: number; // af te dragen (of terug als negatief)
  };
  costs: {
    stripe: number;
    operational: number;
    total: number;
  };
  netProfit: number; // eigen omzet − kosten (excl. btw)
  taxReserve: number; // reservering belasting op de winst
  distributable: number; // "eigen geld": winst − belastingreservering
  settings: FinanceSettings;
}

const SALES_TYPES = ["PLATFORM_FEE", "UITZEND_FEE"] as const; // jouw verkoopfacturen (btw-plichtig voor ZekerFlex)

export async function financeOverview(from: Date, to: Date): Promise<FinanceOverview> {
  const settings = await getFinanceSettings();
  const markupRate = settings.uitzendMarkupRate ?? env.UITZEND_MARKUP_RATE;

  const grouped = await prisma.invoice
    .groupBy({
      by: ["type"],
      where: { status: { in: ["PAID", "ISSUED"] }, createdAt: { gte: from, lt: to } },
      _sum: { subtotalCents: true, vatCents: true, totalCents: true },
    })
    .catch(() => [] as { type: string; _sum: { subtotalCents: number | null; vatCents: number | null; totalCents: number | null } }[]);

  const sub: Record<string, number> = {};
  const vat: Record<string, number> = {};
  const tot: Record<string, number> = {};
  for (const g of grouped) {
    sub[g.type] = g._sum.subtotalCents ?? 0;
    vat[g.type] = g._sum.vatCents ?? 0;
    tot[g.type] = g._sum.totalCents ?? 0;
  }

  const platformFee = sub["PLATFORM_FEE"] ?? 0;
  const uitzendSubtotal = sub["UITZEND_FEE"] ?? 0;
  // subtotal = loon × (1 + opslag); opslag-deel = subtotal × opslag/(1+opslag)
  const uitzendMargin = markupRate > 0 ? Math.round((uitzendSubtotal * markupRate) / (1 + markupRate)) : 0;
  const uitzendWages = uitzendSubtotal - uitzendMargin;
  const freelancerInvoices = sub["SELF_BILL_FREELANCER"] ?? 0;
  const penalties = sub["CANCELLATION_PENALTY"] ?? 0;

  const revenueTotal = platformFee + uitzendMargin;
  const grossInvoiced = Object.values(tot).reduce((s, v) => s + v, 0);

  const months = Math.max(1, Math.round((to.getTime() - from.getTime()) / (30 * DAY)));

  const stripe = Math.round(grossInvoiced * settings.stripeFeePct);
  const operational = settings.operationalMonthlyCents * months;
  const costsTotal = stripe + operational;

  const vatOutput = SALES_TYPES.reduce((s, t) => s + (vat[t] ?? 0), 0);
  const vatInput = Math.round(costsTotal * settings.vatInputPct);
  const vatDue = vatOutput - vatInput;

  const netProfit = revenueTotal - costsTotal;
  const taxReserve = Math.round(Math.max(0, netProfit) * settings.taxReservePct);
  const distributable = netProfit - taxReserve;

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    months,
    revenue: { platformFee, uitzendMargin, total: revenueTotal },
    passthrough: { uitzendWages, freelancerInvoices, penalties, total: uitzendWages + freelancerInvoices + penalties },
    grossInvoiced,
    vat: { output: vatOutput, inputEstimate: vatInput, due: vatDue },
    costs: { stripe, operational, total: costsTotal },
    netProfit,
    taxReserve,
    distributable,
    settings,
  };
}
