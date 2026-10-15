import type Stripe from "stripe";
import { getStripeClient } from "@/lib/billing/stripe";

// ---------------------------------------------------------------------------
// Live read-only view of the Stripe account for /admin/stripe, so the admin
// doesn't have to open the Stripe dashboard: balance, recent payments (with
// the ZekerFlex invoice/shop order they belong to), payouts, disputes and
// 30-day totals. Every section is fetched independently — a restricted key
// without e.g. payout access still shows the rest, with a note.
// ---------------------------------------------------------------------------

export interface MoneyAmount {
  amountCents: number;
  currency: string;
}

export interface PaymentRow {
  id: string;
  created: string;
  amountCents: number;
  refundedCents: number;
  currency: string;
  status: "succeeded" | "pending" | "failed";
  method: string;
  payer: string | null;
  description: string | null;
  link: { href: string; label: string } | null;
  dashboardUrl: string;
}

export interface PayoutRow {
  id: string;
  amountCents: number;
  currency: string;
  arrivalDate: string;
  status: string;
  destination: string | null;
}

export interface DisputeRow {
  id: string;
  amountCents: number;
  currency: string;
  reason: string;
  status: string;
  dueBy: string | null;
  open: boolean;
  dashboardUrl: string;
}

export interface Last30Days {
  grossCents: number;
  feeCents: number;
  refundedCents: number;
  netCents: number;
  payments: number;
}

export interface StripeOverview {
  livemode: boolean;
  balance: { available: MoneyAmount[]; pending: MoneyAmount[] } | null;
  last30: Last30Days | null;
  payments: PaymentRow[];
  payouts: PayoutRow[];
  disputes: DisputeRow[];
  errors: string[];
  fetchedAt: string;
}

const OPEN_DISPUTE = new Set(["warning_needs_response", "needs_response", "warning_under_review", "under_review"]);

const IDEAL_BANK: Record<string, string> = {
  abn_amro: "ABN AMRO",
  asn_bank: "ASN Bank",
  bunq: "bunq",
  ing: "ING",
  knab: "Knab",
  rabobank: "Rabobank",
  regiobank: "RegioBank",
  revolut: "Revolut",
  sns_bank: "SNS",
  triodos_bank: "Triodos",
  van_lanschot: "Van Lanschot",
  n26: "N26",
};

const WALLET: Record<string, string> = {
  apple_pay: "Apple Pay",
  google_pay: "Google Pay",
  samsung_pay: "Samsung Pay",
  link: "Link",
};

const iso = (unixSeconds: number) => new Date(unixSeconds * 1000).toISOString();
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "iDEAL · ING", "Apple Pay · Visa •••• 4242", "Bancontact", … */
export function describeMethod(details: Stripe.Charge.PaymentMethodDetails | null): string {
  if (!details) return "—";
  if (details.type === "card" && details.card) {
    const card = `${cap(details.card.brand ?? "kaart")} •••• ${details.card.last4 ?? "????"}`;
    const wallet = details.card.wallet?.type ? WALLET[details.card.wallet.type] ?? cap(details.card.wallet.type.replace(/_/g, " ")) : null;
    return wallet ? `${wallet} · ${card}` : card;
  }
  if (details.type === "ideal") {
    const bank = details.ideal?.bank ? IDEAL_BANK[details.ideal.bank] ?? cap(details.ideal.bank.replace(/_/g, " ")) : null;
    return bank ? `iDEAL · ${bank}` : "iDEAL";
  }
  if (details.type === "card_present" && details.card_present) {
    return `${cap(details.card_present.brand ?? "kaart")} •••• ${details.card_present.last4 ?? "????"} · aan de kassa`;
  }
  if (details.type === "sepa_debit") return `SEPA-incasso •••• ${details.sepa_debit?.last4 ?? "????"}`;
  if (details.type === "bancontact") return "Bancontact";
  if (details.type === "link") return "Stripe Link";
  return cap(details.type.replace(/_/g, " "));
}

/** Which ZekerFlex record a payment settled, from the metadata our Checkout Sessions set. */
export function linkFor(metadata: Stripe.Metadata | null | undefined): PaymentRow["link"] {
  if (!metadata) return null;
  if (metadata.invoiceId) return { href: `/api/invoices/${metadata.invoiceId}/pdf`, label: "Factuur" };
  if (metadata.invoiceIds) {
    try {
      const ids = JSON.parse(metadata.invoiceIds) as string[];
      return { href: "/admin/facturen?status=PAID", label: `${ids.length} facturen` };
    } catch {
      return { href: "/admin/facturen?status=PAID", label: "Facturen" };
    }
  }
  if (metadata.shopOrderId) return { href: "/admin/shop", label: "Shopbestelling" };
  if (metadata.planKey) return { href: "/admin/integraties", label: "API-abonnement" };
  return null;
}

export function summarizeLast30(txns: Stripe.BalanceTransaction[]): Last30Days {
  let grossCents = 0;
  let feeCents = 0;
  let refundedCents = 0;
  let netCents = 0;
  let payments = 0;
  for (const t of txns) {
    if (t.currency !== "eur") continue;
    if (t.type === "charge" || t.type === "payment") {
      grossCents += t.amount;
      payments += 1;
    } else if (t.type === "refund" || t.type === "payment_refund") {
      refundedCents += -t.amount;
    } else if (t.type === "stripe_fee" || t.type === "stripe_fx_fee") {
      // Stripe's own charges (Radar, Tax, …) are separate transactions with the cost in `amount`.
      feeCents += -t.amount;
    }
    if (t.type !== "payout") {
      feeCents += t.fee;
      netCents += t.net;
    }
  }
  return { grossCents, feeCents, refundedCents, netCents, payments };
}

function sectionError(section: string, reason: unknown): string {
  const msg = reason instanceof Error ? reason.message : String(reason);
  return /permission|restricted|does not have/i.test(msg)
    ? `${section}: de Stripe-sleutel heeft hier geen leesrechten voor.`
    : `${section}: ${msg}`;
}

export async function getStripeOverview(): Promise<StripeOverview> {
  const stripe = getStripeClient();
  const since = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;

  const [balance, charges, payouts, disputes, txns] = await Promise.allSettled([
    stripe.balance.retrieve(),
    stripe.charges.list({ limit: 25, expand: ["data.payment_intent"] }),
    stripe.payouts.list({ limit: 10, expand: ["data.destination"] }),
    stripe.disputes.list({ limit: 20 }),
    stripe.balanceTransactions.list({ created: { gte: since }, limit: 100 }).autoPagingToArray({ limit: 2000 }),
  ]);

  const errors: string[] = [];
  let livemode = true;

  const out: StripeOverview = {
    livemode,
    balance: null,
    last30: null,
    payments: [],
    payouts: [],
    disputes: [],
    errors,
    fetchedAt: new Date().toISOString(),
  };

  if (balance.status === "fulfilled") {
    livemode = balance.value.livemode;
    const map = (list: Stripe.Balance.Available[] | Stripe.Balance.Pending[]) =>
      list.map((b) => ({ amountCents: b.amount, currency: b.currency }));
    out.balance = { available: map(balance.value.available), pending: map(balance.value.pending) };
  } else {
    errors.push(sectionError("Saldo", balance.reason));
  }

  const dash = (path: string) => `https://dashboard.stripe.com/${livemode ? "" : "test/"}${path}`;

  if (charges.status === "fulfilled") {
    out.payments = charges.value.data.map((c) => {
      const pi = typeof c.payment_intent === "object" && c.payment_intent ? c.payment_intent : null;
      return {
        id: c.id,
        created: iso(c.created),
        amountCents: c.amount,
        refundedCents: c.amount_refunded,
        currency: c.currency,
        status: c.status === "succeeded" ? "succeeded" : c.status === "failed" ? "failed" : "pending",
        method: describeMethod(c.payment_method_details),
        payer: c.billing_details?.email ?? c.receipt_email ?? c.billing_details?.name ?? null,
        description: c.description ?? null,
        link: linkFor(pi?.metadata ?? c.metadata),
        dashboardUrl: dash(`payments/${pi?.id ?? c.id}`),
      };
    });
  } else {
    errors.push(sectionError("Betalingen", charges.reason));
  }

  if (payouts.status === "fulfilled") {
    out.payouts = payouts.value.data.map((p) => {
      const dest = typeof p.destination === "object" && p.destination && !("deleted" in p.destination) ? p.destination : null;
      const destination =
        dest?.object === "bank_account"
          ? `${dest.bank_name ?? "Bank"} •••• ${dest.last4}`
          : dest?.object === "card"
            ? `${cap(dest.brand)} •••• ${dest.last4}`
            : null;
      return {
        id: p.id,
        amountCents: p.amount,
        currency: p.currency,
        arrivalDate: iso(p.arrival_date),
        status: p.status,
        destination,
      };
    });
  } else {
    errors.push(sectionError("Uitbetalingen", payouts.reason));
  }

  if (disputes.status === "fulfilled") {
    out.disputes = disputes.value.data.map((d) => ({
      id: d.id,
      amountCents: d.amount,
      currency: d.currency,
      reason: d.reason,
      status: d.status,
      dueBy: d.evidence_details?.due_by ? iso(d.evidence_details.due_by) : null,
      open: OPEN_DISPUTE.has(d.status),
      dashboardUrl: dash(`disputes/${d.id}`),
    }));
  } else {
    errors.push(sectionError("Geschillen", disputes.reason));
  }

  if (txns.status === "fulfilled") {
    out.last30 = summarizeLast30(txns.value);
  } else {
    errors.push(sectionError("Omzet 30 dagen", txns.reason));
  }

  out.livemode = livemode;
  return out;
}
