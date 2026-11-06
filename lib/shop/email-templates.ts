// Email templates for shop events

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  variables: string[]; // {{variable}} placeholders
}

export const EMAIL_TEMPLATES: Record<string, EmailTemplate> = {
  order_confirmation: {
    id: "order_confirmation",
    name: "Orderbevestiging",
    subject: "Je bestelling #{{orderId}} is bevestigd",
    htmlBody: `
      <h1>Bedankt voor je bestelling!</h1>
      <p>Hierbij je ordergegevens:</p>
      <p><strong>Ordernummer:</strong> {{orderId}}</p>
      <p><strong>Totaalbedrag:</strong> {{totalPrice}}</p>
      <p><strong>Verwachte bezorgdatum:</strong> {{estimatedDelivery}}</p>
      <p><a href="{{orderLink}}">Bekijk je bestelling</a></p>
    `,
    textBody: `Orderbevestiging\nOrdernummer: {{orderId}}\nTotaal: {{totalPrice}}`,
    variables: ["orderId", "totalPrice", "estimatedDelivery", "orderLink"],
  },
  subscription_welcome: {
    id: "subscription_welcome",
    name: "Welkom abonnement",
    subject: "Welkom bij ons abonnement {{plan}}!",
    htmlBody: `
      <h1>Je abonnement is geactiveerd!</h1>
      <p>Hallo {{customerName}},</p>
      <p>Je {{plan}} abonnement is nu actief.</p>
      <p><strong>Maandelijks bedrag:</strong> {{monthlyPrice}}</p>
      <p><a href="{{dashboardLink}}">Beheer je abonnement</a></p>
    `,
    textBody: `Abonnement {{plan}} geactiveerd\nMaandelijks: {{monthlyPrice}}`,
    variables: ["customerName", "plan", "monthlyPrice", "dashboardLink"],
  },
  payment_failed: {
    id: "payment_failed",
    name: "Betaling mislukt",
    subject: "Betaling voor je bestelling kon niet worden verwerkt",
    htmlBody: `
      <h1>Betaling mislukt</h1>
      <p>Helaas kon je betaling niet worden verwerkt.</p>
      <p>Probeer opnieuw of gebruik een ander betaalmiddel.</p>
      <p><a href="{{retryLink}}">Betaling opnieuw proberen</a></p>
    `,
    textBody: `Je betaling kon niet worden verwerkt. Probeer opnieuw.`,
    variables: ["retryLink"],
  },
  subscription_renewed: {
    id: "subscription_renewed",
    name: "Abonnement vernieuwd",
    subject: "Je abonnement {{plan}} is vernieuwd",
    htmlBody: `
      <h1>Abonnement vernieuwd</h1>
      <p>Je abonnement {{plan}} is automatisch vernieuwd.</p>
      <p><strong>Bedrag:</strong> {{amount}}</p>
      <p><strong>Volgende vernieuwing:</strong> {{nextRenewalDate}}</p>
      <p><a href="{{invoiceLink}}">Download je factuur</a></p>
    `,
    textBody: `Abonnement vernieuwd - {{amount}} op {{nextRenewalDate}}`,
    variables: ["plan", "amount", "nextRenewalDate", "invoiceLink"],
  },
  refund_processed: {
    id: "refund_processed",
    name: "Terugbetaling verwerkt",
    subject: "Je terugbetaling van {{amount}} is verwerkt",
    htmlBody: `
      <h1>Terugbetaling verwerkt</h1>
      <p>Je terugbetaling van {{amount}} voor bestelling #{{orderId}} is goedgekeurd.</p>
      <p>Je geld wordt binnen 3-5 werkdagen teruggestort op je rekening.</p>
    `,
    textBody: `Terugbetaling {{amount}} verwerkt voor bestelling {{orderId}}`,
    variables: ["amount", "orderId"],
  },
};

export function renderTemplate(template: EmailTemplate, variables: Record<string, string>): string {
  let html = template.htmlBody;
  for (const [key, value] of Object.entries(variables)) {
    html = html.replace(new RegExp(`{{${key}}}`, "g"), value);
  }
  return html;
}

export function getTemplate(id: string): EmailTemplate | null {
  return EMAIL_TEMPLATES[id] || null;
}
