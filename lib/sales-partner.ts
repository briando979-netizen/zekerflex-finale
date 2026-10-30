// ---------------------------------------------------------------------------
// Commissie-model voor sales-partners (ZZP, op commissie). Kernprincipe:
// ZekerFlex betaalt ALLEEN uit fee die het zelf al heeft verdiend/geïncasseerd
// — nooit vooraf. Aligned incentives, self-funding CAC, geen vaste kosten.
// Dit voedt /sales-partner (werving) + /api/sales-partner (aanmeldingen).
// Bedragen/percentages zijn indicatief en instelbaar.
// ---------------------------------------------------------------------------

export const PLATFORM_FEE_PER_HOUR_EUR = 3.5; // wat de opdrachtgever per gewerkt uur betaalt

export const SALES_PARTNER = {
  activationBonusEur: 100, // eenmalig per opdrachtgever, bij diens eerste voltooide klus
  revenueSharePct: 20, // % van de €3,50/uur platformfee
  revenueShareMonths: 12, // duur van de doorlopende commissie per klant
  freelancerBonusEur: 25, // per aangebrachte freelancer die zijn eerste klus voltooit
  tierClients: 10, // vanaf zoveel actieve klanten:
  tierRevenueSharePct: 25, // hoger % op NIEUWE klanten
} as const;

/** €/uur dat een partner verdient uit de doorlopende commissie (revenue share). */
export function sharePerHourEur(pct: number = SALES_PARTNER.revenueSharePct): number {
  return Math.round(PLATFORM_FEE_PER_HOUR_EUR * (pct / 100) * 100) / 100;
}

/** Indicatieve maandverdienste uit één actieve klant bij een aantal gewerkte uren. */
export function monthlyFromClientEur(hoursPerMonth: number, pct: number = SALES_PARTNER.revenueSharePct): number {
  return Math.round(sharePerHourEur(pct) * hoursPerMonth);
}

export interface PayStep {
  title: string;
  body: string;
}

export const HOW_IT_WORKS: PayStep[] = [
  { title: "1. Breng een opdrachtgever binnen", body: "Jij benadert bedrijven die flexkrachten of zzp'ers nodig hebben en zet ze op ZekerFlex. Wij helpen met demo, onboarding en verificatie." },
  { title: "2. Ze draaien hun eerste klus", body: "Zodra de eerste dienst is gewerkt en goedgekeurd, heeft ZekerFlex fee verdiend — en krijg jij je aanbrengbonus." },
  { title: "3. Je verdient door, elke maand", body: `Zolang die klant flexkrachten inhuurt, krijg jij ${SALES_PARTNER.revenueSharePct}% van de €${PLATFORM_FEE_PER_HOUR_EUR.toFixed(2).replace(".", ",")}/uur platformfee — ${SALES_PARTNER.revenueShareMonths} maanden lang, maandelijks uitbetaald.` },
];

export const SALES_PARTNER_FAQ: { q: string; a: string }[] = [
  { q: "Wanneer word ik betaald?", a: `Je aanbrengbonus van €${SALES_PARTNER.activationBonusEur} krijg je zodra jouw opdrachtgever zijn eerste klus heeft laten uitvoeren. De doorlopende commissie (${SALES_PARTNER.revenueSharePct}% van de fee) wordt maandelijks uitbetaald over de daadwerkelijk gewerkte uren — dus alleen uit geld dat ZekerFlex echt heeft verdiend.` },
  { q: "Wat verdien ik ongeveer?", a: `Dat schaalt met hoe actief je klanten zijn. Eén klant die twee mensen 40 uur/week laat werken is ~320 uur/maand → ~€${monthlyFromClientEur(320)} per maand uit die ene klant, een jaar lang. Meerdere klanten stapelen op.` },
  { q: "Zijn er kosten of vaste uren?", a: "Nee. Je werkt als zzp'er, bepaalt zelf je uren en tempo, en er is geen target of boete. Je investeert je tijd; wij betalen uit resultaat." },
  { q: "Kan ik ook freelancers aanbrengen?", a: `Ja. Voor elke freelancer die je aanbrengt en die zijn eerste klus voltooit, krijg je €${SALES_PARTNER.freelancerBonusEur}.` },
  { q: "Hoe word ik uitbetaald?", a: "Als zzp'er via maandelijkse (self-billing) facturatie. Je ziet je aangebrachte klanten, hun uren en je commissie terug in je partner-overzicht." },
];
