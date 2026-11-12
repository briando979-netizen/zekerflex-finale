import { SAAS_PLANS, SAAS_PLAN_KEYS, isSaasPlanKey, type SaasPlanKey } from "@/lib/billing/saas-plans";
import { AANBOD, PIJLERS, aanbodHref, type PijlerSleutel } from "@/lib/marketing/aanbod";

// ---------------------------------------------------------------------------
// Scherm "Abonnement en uitbreidingen" (werkgever): wat heb je, wat kun je erbij nemen. Zuiver en
// zonder eigen bedragen: prijzen komen uitsluitend uit lib/billing/saas-plans.ts en
// lib/marketing/aanbod.ts. Staat daar geen prijs, dan staat er "Prijs volgt". De uitzendopslag
// komt hier nooit voor. Het bankonderdeel staat uit (BANK_AAN) en wordt dus niet getoond.
// In de Android- en iPhone-app (lib/app-mode.ts) is er geen koopknop: Google en Apple hebben eigen
// betaalregels voor digitale abonnementen; daar staat alleen de uitleg "regel dit op zekerflex.com".
// ---------------------------------------------------------------------------

export type AbonnementStatus = "actief" | "betaling-mislukt" | "opgezegd";

export interface HuidigAbonnement {
  plan: SaasPlanKey;
  status: AbonnementStatus;
  /** Einde van de lopende periode (ISO), indien bekend. */
  tot: string | null;
}

interface OpgeslagenAbonnement {
  planKey: string;
  status: string;
  currentPeriodEnd: Date | null;
}

/** Het abonnement uit de tabel ApiSubscription (planKey "saas:pro" of "pro"); zonder rij of bij opzegging is dat Starter. */
export function huidigAbonnement(rij: OpgeslagenAbonnement | null | undefined): HuidigAbonnement {
  const sleutel = rij?.planKey.replace(/^saas:/, "") ?? "";
  if (!rij || !isSaasPlanKey(sleutel)) return { plan: "starter", status: "actief", tot: null };
  if (rij.status === "canceled") return { plan: "starter", status: "opgezegd", tot: rij.currentPeriodEnd?.toISOString() ?? null };
  return { plan: sleutel, status: rij.status === "past_due" ? "betaling-mislukt" : "actief", tot: rij.currentPeriodEnd?.toISOString() ?? null };
}

/** € 149 per maand, € 9,95 en dergelijke; alleen uit een bedrag in centen dat in saas-plans.ts staat. */
export function maandPrijs(cent: number | null): string {
  if (cent === null) return "Op aanvraag";
  if (cent === 0) return "Gratis";
  const euro = cent % 100 === 0 ? String(cent / 100) : (cent / 100).toFixed(2).replace(".", ",");
  return `€ ${euro} per maand`;
}

export type PlanActie = "huidig" | "kopen" | "contact" | "lager";

export interface PlanRegel {
  sleutel: SaasPlanKey;
  naam: string;
  tagline: string;
  prijs: string;
  punten: string[];
  actie: PlanActie;
}

export function planRegels(huidig: HuidigAbonnement): PlanRegel[] {
  const nu = SAAS_PLAN_KEYS.indexOf(huidig.plan);
  return SAAS_PLAN_KEYS.map((sleutel, i) => {
    const p = SAAS_PLANS[sleutel];
    const actie: PlanActie = sleutel === huidig.plan ? "huidig" : i < nu ? "lager" : p.selfService && p.priceCentsPerMonth ? "kopen" : "contact";
    return { sleutel, naam: p.label, tagline: p.tagline, prijs: maandPrijs(p.priceCentsPerMonth), punten: p.features, actie };
  });
}

export interface UitbreidingRegel {
  slug: string;
  naam: string;
  kort: string;
  prijs: string;
  beschikbaar: boolean;
  href: string;
}

export interface UitbreidingGroep {
  pijler: PijlerSleutel;
  naam: string;
  items: UitbreidingRegel[];
}

/** Items die we niet tonen: alles wat via de bank loopt (staat uit). */
const verborgen = (naam: string, slug: string) => /bank|betaalverzoek/i.test(`${naam} ${slug}`);

export function uitbreidingen(): UitbreidingGroep[] {
  return PIJLERS.map((pl) => ({
    pijler: pl.sleutel,
    naam: pl.naam,
    items: AANBOD.filter((a) => a.pijler === pl.sleutel && !verborgen(a.naam, a.slug)).map((a) => ({
      slug: a.slug,
      naam: a.naam,
      kort: a.kort,
      prijs: a.prijs ?? "Prijs volgt",
      beschikbaar: a.status === "beschikbaar",
      href: aanbodHref(a),
    })),
  })).filter((g) => g.items.length > 0);
}

export const REGEL_OP_WEBSITE = "Een abonnement wijzig je op zekerflex.com, niet in de app. Open zekerflex.com in je browser en ga naar Abonnement en uitbreidingen.";
