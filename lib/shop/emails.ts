// Transactional emails voor shop

import { sendMail } from "@/lib/mail";

export interface OrderConfirmationEmail {
  to: string;
  orderId: string;
  items: Array<{ name: string; quantity: number; priceCents: number }>;
  totalCents: number;
  purchaseMode: "onetime" | "subscription";
  monthlyPrice?: number;
}

export async function sendOrderConfirmation(params: OrderConfirmationEmail) {
  return sendMail({
    to: params.to,
    subject: `Bestelling #${params.orderId} bevestigd`,
    html: `
      <h2>Bedankt voor je aankoop!</h2>
      <p>Bestelling <strong>#${params.orderId}</strong> is ontvangen.</p>

      <h3>Samenvatting:</h3>
      <ul>
        ${params.items.map((i) => `<li>${i.name} × ${i.quantity} — € ${(i.priceCents / 100).toFixed(2)}</li>`).join("")}
      </ul>

      <p><strong>Totaal: € ${(params.totalCents / 100).toFixed(2)}</strong></p>

      ${params.purchaseMode === "subscription" ? `<p>Dit is een maandelijks abonnement. Je wordt factureerd op € ${(params.monthlyPrice! / 100).toFixed(2)}/maand.</p>` : ""}

      <p><a href="https://zekerflex.nl/shop/account">Bekijk je bestelling</a></p>
    `,
  });
}

export async function sendSubscriptionRenewalEmail(params: {
  to: string;
  subscriptionId: string;
  totalCents: number;
  nextChargeDate: Date;
}) {
  return sendMail({
    to: params.to,
    subject: "Je abonnement wordt vernieuwd",
    html: `
      <h2>Abonnement vernieuwing</h2>
      <p>Je abonnement wordt op <strong>${params.nextChargeDate.toLocaleDateString("nl-NL")}</strong> vernieuwd.</p>
      <p>Bedrag: <strong>€ ${(params.totalCents / 100).toFixed(2)}</strong></p>
      <p><a href="https://zekerflex.nl/shop/account">Beheer je abonnement</a></p>
    `,
  });
}

export async function sendPaymentFailedEmail(params: {
  to: string;
  subscriptionId: string;
  reason: string;
}) {
  return sendMail({
    to: params.to,
    subject: "⚠ Betaling mislukt",
    html: `
      <h2>Betaling kon niet worden verwerkt</h2>
      <p>We konden je betaling niet verwerken: <strong>${params.reason}</strong></p>
      <p>Probeer een andere betaalmethode of <a href="https://zekerflex.nl/shop/account">update je gegevens</a>.</p>
    `,
  });
}

export async function sendCancellationEmail(params: {
  to: string;
  subscriptionId: string;
  canceledAt: Date;
}) {
  return sendMail({
    to: params.to,
    subject: "Abonnement opgezegd",
    html: `
      <h2>Je abonnement is opgezegd</h2>
      <p>We hebben je abonnement op ${params.canceledAt.toLocaleDateString("nl-NL")} afgesloten.</p>
      <p>Bedankt dat je ons hebt geprobeerd! Je gegevens blijven beschikbaar.</p>
    `,
  });
}
