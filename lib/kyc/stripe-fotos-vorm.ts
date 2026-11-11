// ---------------------------------------------------------------------------
// Pure hulpjes voor de foto's van een Stripe-controle (lib/kyc/stripe-fotos.ts): welk bestand
// bij voorkant, achterkant of selfie hoort, en of een geplakte sleutel de juiste vorm heeft.
// Stripe geeft die foto's alleen aan een beperkte sleutel (rk_…), nooit aan de gewone geheime
// sleutel (docs.stripe.com/identity/access-verification-results).
// ---------------------------------------------------------------------------

import type { FotoSoort } from "@/lib/admin/kyc-weergave";

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const bestand = (v: unknown): string | null => (typeof v === "string" && /^file_[A-Za-z0-9]+$/.test(v) ? v : null);

/**
 * Het Stripe-bestand bij een foto uit een VerificationReport: document.files = [voorkant,
 * achterkant] (een paspoort heeft er één), selfie.selfie = het gezicht.
 */
export function stripeBestandId(rapport: unknown, welk: FotoSoort): string | null {
  const r = obj(rapport);
  if (welk === "selfie") return bestand(obj(r?.selfie)?.selfie);
  const files = obj(r?.document)?.files;
  if (!Array.isArray(files)) return null;
  return bestand(files[welk === "front" ? 0 : 1]);
}

/** Een foutmelding voor de beheerder, of null als de sleutel de goede vorm heeft. */
export function stripeFotoSleutelFout(sleutel: string, liveAccount: boolean): string | null {
  const s = sleutel.trim();
  if (/^sk_(live|test)_/.test(s)) return "Dit is de gewone geheime sleutel (sk_…). Maak in Stripe een beperkte sleutel (rk_…) met alleen de rechten hieronder.";
  if (!/^rk_(live|test)_[A-Za-z0-9]{20,}$/.test(s)) return "Dit lijkt geen beperkte Stripe-sleutel. Hij begint met rk_live_.";
  if (liveAccount && s.startsWith("rk_test_")) return "Dit is een testsleutel. ZekerFlex werkt met live gegevens: maak de sleutel in Stripe met 'Testmodus' uit.";
  return null;
}

/** De laatste vier tekens: genoeg om de sleutel in Stripe terug te vinden, nooit de sleutel zelf. */
export const sleutelEind = (sleutel: string): string => sleutel.trim().slice(-4);
