// ---------------------------------------------------------------------------
// Het live Stripe-account ontvangt geen betalingen meer (11 nov 2026, 17:30 UTC: charges_enabled en payouts_enabled
// op false, alle capabilities uit, zonder melding). Dan valt ZekerFlex netjes terug in plaats van fouten te geven:
//  - de vlag `stripe:betalen-uit` (1 uur, steeds verlengd zolang het zo is): de bankcontrole via iDEAL verbergt zich
//    en het bankafschrift is meteen de route (app/api/me/bank-verify, ComplianceDocsPanel);
//  - de stand `stripe:account-stand`: elke 15 minuten gemeten (cron /api/internal/stripe/account-stand) en bij de
//    webhook account.updated; slaat hij om naar uit, dan krijgt de eigenaar meteen een melding (critical);
//  - de taak "stripe-betalen-uit" in Admin → Te doen opent zichzelf en vinkt zichzelf af zodra betalen weer aan staat.
// Eén waarschuwing per uur in het logboek, niet bij elke poging. Pure regels in stripe-betalen-stand.ts.
// ---------------------------------------------------------------------------

import { kvDelete, kvGet, kvSet } from "@/lib/storage/kv";
import { logger } from "@/lib/logger";
import { alertOwnerLater } from "@/lib/ops/alert";
import { AppError } from "@/lib/errors";
import { leesStand, nieuweStand, slaatOmNaarUit, type AccountStand } from "@/lib/billing/stripe-betalen-stand";
import { laadActieveStripeSleutel } from "@/lib/billing/stripe-account";

export const BETALEN_UIT_KEY = "stripe:betalen-uit";
export const ACCOUNT_STAND_KEY = "stripe:account-stand";
export const BETALEN_UIT_MS = 60 * 60 * 1000;

export interface BetalenUit {
  tot: string;
  op: string;
  melding: string;
}

/** De vlag als die nog geldt, anders null. */
export async function betalenUit(nu: number = Date.now()): Promise<BetalenUit | null> {
  const v = await kvGet<BetalenUit>(BETALEN_UIT_KEY);
  return v && typeof v.tot === "string" && Date.parse(v.tot) > nu ? v : null;
}

/** Zet (of verlengt) de vlag voor een uur; een waarschuwing in het logboek alleen als hij nog niet aan stond. */
export async function zetBetalenUit(melding: string, nu: number = Date.now()): Promise<void> {
  const al = await betalenUit(nu).catch(() => null);
  await kvSet(BETALEN_UIT_KEY, { tot: new Date(nu + BETALEN_UIT_MS).toISOString(), op: al?.op ?? new Date(nu).toISOString(), melding: melding.slice(0, 200) } satisfies BetalenUit);
  if (!al) logger.warn("stripe: het live account ontvangt geen betalingen, iDEAL-bankcontrole 1 uur uit (Admin → Te doen)", { error: melding.slice(0, 200) });
}

/** De laatst gemeten stand van het account (voor de takenlijst). */
export async function accountStand(): Promise<AccountStand | null> {
  return leesStand(await kvGet<unknown>(ACCOUNT_STAND_KEY));
}

/**
 * Verwerkt een gemeten stand (uit GET /v1/account of uit de webhook): bewaren, de vlag zetten of wissen, en bij het
 * omslaan naar uit de eigenaar meteen waarschuwen. `sleutel` maakt de melding idempotent (Stripe stuurt soms dubbel).
 */
export async function verwerkAccountStand(betalen: boolean, uitbetalen: boolean, sleutel: string, nu: Date = new Date()): Promise<AccountStand> {
  const oud = await accountStand().catch(() => null);
  const stand = nieuweStand(oud, betalen, uitbetalen, nu);
  await kvSet(ACCOUNT_STAND_KEY, stand);
  if (!betalen) await zetBetalenUit("charges_enabled=false", nu.getTime());
  else await kvDelete(BETALEN_UIT_KEY).catch(() => undefined);
  if (slaatOmNaarUit(oud, stand)) {
    alertOwnerLater({
      key: `stripe-betalen-uit:${sleutel}`,
      title: "Stripe heeft betalingen uitgezet: kijk in het Stripe-dashboard",
      detail: `Het live Stripe-account ${!betalen ? "ontvangt geen betalingen meer" : ""}${!betalen && !uitbetalen ? " en " : ""}${!uitbetalen ? "betaalt niet meer uit" : ""}. Inloggen bij de bank (iDEAL) staat daarom uit; werkers uploaden een bankafschrift. Lees de melding bovenaan in het Stripe-dashboard of neem contact op met Stripe. Zie Admin → Te doen.`,
      severity: "critical",
      url: "/admin/te-doen",
    });
  }
  return stand;
}

/** Elke 15 minuten (cron): het eigen account bij Stripe opvragen. Zonder Stripe-sleutel: niets. */
export async function meetStripeAccount(nu: Date = new Date()): Promise<AccountStand | null> {
  // dynamisch: stripe.ts importeert dit bestand (eisBetalenAan), zo ontstaat geen kring
  const { getStripeClient } = await import("@/lib/billing/stripe");
  const a = await getStripeClient().accounts.retrieveCurrent();
  return verwerkAccountStand(Boolean(a.charges_enabled), Boolean(a.payouts_enabled), `meting-${nu.toISOString().slice(0, 13)}`, nu);
}

/**
 * Vóór elke nieuwe Stripe-betaling (Checkout-sessie, PaymentIntent): staat de vlag aan, dan een 423 met code
 * BETALEN_UIT en rustige tekst, in plaats van een vage 500 uit Stripe. Een storing in de KV laat de betaling door.
 */
export async function eisBetalenAan(nu: number = Date.now()): Promise<void> {
  // het account uit Beheer → Stripe-account (hooguit eens per minuut uit de KV); een storing laat .env gelden
  await laadActieveStripeSleutel(nu).catch(() => undefined);
  if (await betalenUit(nu).catch(() => null)) throw AppError.betalenUit();
}
