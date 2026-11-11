// ---------------------------------------------------------------------------
// Stripe weigert Stripe Identity voor het hele account ("This account is unable to perform this action"):
// geen tijdelijke storing, maar iets wat de eigenaar in het Stripe-dashboard moet regelen. Dan stopt
// ZekerFlex 24 uur met proberen (de sync bij elk bezoek aan de verificatiepagina en de knop "Snel via
// Stripe"), schrijft één waarschuwing in het logboek en zet een taak klaar in Admin → Te doen
// (lib/admin/owner-todos.ts, "stripe-identity-account"). Na 24 uur probeert het opnieuw.
// Los bestand (alleen KV), zodat de takenlijst het kan lezen zonder de hele Stripe-koppeling.
// 11 nov 2026: 3 keer in het foutenlogboek bij één werker met een open Stripe-sessie.
// ---------------------------------------------------------------------------

import { kvGet, kvSet } from "@/lib/storage/kv";

export const WEIGERING_KEY = "stripe-identity:account-geweigerd";
export const WEIGERING_MS = 24 * 60 * 60 * 1000;

export interface StripeWeigering {
  /** tot wanneer ZekerFlex het niet opnieuw probeert (ISO) */
  tot: string;
  /** wanneer Stripe weigerde (ISO) */
  op: string;
  /** de melding van Stripe, ingekort */
  melding: string;
}

/** Zegt Stripe dat dit account (of deze sleutel) Identity niet mag gebruiken, in plaats van een tijdelijke storing? */
export function isAccountWeigering(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { type?: unknown; statusCode?: unknown; message?: unknown };
  if (e.type === "StripePermissionError" || e.statusCode === 403) return true;
  return /unable to perform this action|has not been activated|not activated for identity|identity is not enabled/i.test(typeof e.message === "string" ? e.message : "");
}

/** De weigering als die nog geldt, anders null. */
export async function actieveWeigering(nu: number = Date.now()): Promise<StripeWeigering | null> {
  const w = await kvGet<StripeWeigering>(WEIGERING_KEY);
  return w && typeof w.tot === "string" && Date.parse(w.tot) > nu ? w : null;
}

/** Legt de weigering vast voor 24 uur. */
export async function zetWeigering(melding: string, nu: number = Date.now()): Promise<StripeWeigering> {
  const w: StripeWeigering = { tot: new Date(nu + WEIGERING_MS).toISOString(), op: new Date(nu).toISOString(), melding: melding.slice(0, 200) };
  await kvSet(WEIGERING_KEY, w);
  return w;
}
