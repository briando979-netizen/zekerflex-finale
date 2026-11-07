// ---------------------------------------------------------------------------
// Uitbetalen voor een horecazaak, het pure deel. Het geld van gasten staat op
// het eigen Stripe-account van de zaak: Stripe bewaart het (met vergunning),
// niet ZekerFlex. Standaard zet Stripe het elke werkdag op de bankrekening van
// de zaak ("automatisch"). Zet de zaak dat uit, dan blijft het klaarstaan tot
// zij zelf opneemt. Puur: los te testen, ook in de browser.
// ---------------------------------------------------------------------------

export interface StripeBedrag {
  amount: number;
  currency: string;
}

/** Het bedrag in euro uit een saldo-lijst van Stripe (available of pending). */
export const euroUit = (lijst: readonly StripeBedrag[] | null | undefined): number =>
  (lijst ?? []).filter((b) => b.currency.toLowerCase() === "eur").reduce((s, b) => s + b.amount, 0);

/** Automatisch = alles behalve "manual" (Stripe kent daily, weekly, monthly). */
export const isAutomatisch = (interval: string | null | undefined): boolean => interval !== "manual";

/** Vanaf dit bedrag kun je opnemen (Stripe weigert heel kleine uitbetalingen). */
export const MIN_OPNAME_CENT = 100;

/** Hoeveel er wordt opgenomen: alles wat klaarstaat, of het gevraagde bedrag. */
export function opneemBedrag(gevraagdCent: number | null | undefined, beschikbaarCent: number): { ok: true; bedragCent: number } | { ok: false; fout: string } {
  if (beschikbaarCent < MIN_OPNAME_CENT) return { ok: false, fout: "Er staat nog geen geld klaar om op te nemen (vanaf € 1). Geld van vandaag komt meestal binnen een paar werkdagen vrij." };
  if (gevraagdCent === null || gevraagdCent === undefined) return { ok: true, bedragCent: beschikbaarCent };
  if (!Number.isInteger(gevraagdCent) || gevraagdCent < MIN_OPNAME_CENT) return { ok: false, fout: "Neem minstens € 1 op." };
  if (gevraagdCent > beschikbaarCent) return { ok: false, fout: `Je kunt hooguit ${euroTekst(beschikbaarCent)} opnemen.` };
  return { ok: true, bedragCent: gevraagdCent };
}

export const euroTekst = (cent: number) => `€ ${(cent / 100).toFixed(2).replace(".", ",")}`;

/** De stand van een uitbetaling in gewoon Nederlands. */
export const UITBETALING_STATUS: Record<string, string> = {
  paid: "Op je rekening",
  pending: "Onderweg",
  in_transit: "Onderweg",
  canceled: "Geannuleerd",
  failed: "Mislukt",
};

export const statusTekst = (s: string) => (Object.hasOwn(UITBETALING_STATUS, s) ? UITBETALING_STATUS[s] : undefined) ?? s;

/** Een bedrag uit het invulveld ("12,50", "12.50", "€ 12") in cent, of null als het leeg is (= alles). */
export function leesBedrag(invoer: string): number | null | "fout" {
  const s = invoer.replace(/[€\s]/g, "").replace(",", ".");
  if (!s) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return "fout";
  return Math.round(Number(s) * 100);
}
