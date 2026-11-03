// Wie mag een offerte zien? Puur, los te testen.
// Het team altijd. De gast alleen zijn eigen aanvraag, en pas als het team de
// status op offerte (of geboekt) heeft gezet én een bedrag heeft ingevuld.

export interface OfferteAanvraag {
  email: string;
  account?: string | undefined;
  status: string;
  bedrag: number | null;
}

export const offerteKlaar = (a: Pick<OfferteAanvraag, "status" | "bedrag">) => (a.status === "offerte" || a.status === "geboekt") && a.bedrag !== null;

export function magOfferteZien(a: OfferteAanvraag, wie: { email?: string | undefined; beheerder: boolean }): boolean {
  if (wie.beheerder) return true;
  const e = wie.email?.trim().toLowerCase();
  if (!e) return false;
  return (a.email.toLowerCase() === e || a.account?.toLowerCase() === e) && offerteKlaar(a);
}
