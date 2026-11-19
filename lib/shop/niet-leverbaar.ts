// ---------------------------------------------------------------------------
// Wat /shop/<slug> doet met een product dat niet (meer) te koop is (19 nov 2026).
// Oude links (Google, bladwijzers, een gedeelde link, de paskamer) wezen naar
// eigen producten die we uitzetten toen de leverancier-producten kwamen; die gaven
// een kale 404. Nu krijgt een eigen product dat uit staat een pagina "Niet meer
// leverbaar" met vergelijkbare producten, zoals een grote webwinkel dat doet.
// Een product van een verkoper op de marktplaats dat uit staat (in beoordeling,
// afgewezen, gepauzeerd) blijft verborgen: dat is nooit openbaar geweest of mag
// het niet meer zijn. Puur bestand (geen prisma), zodat het te testen is.
// ---------------------------------------------------------------------------

export type ProductZicht = "toon" | "niet-leverbaar" | "verborgen";

export function productZicht(p: { active: boolean; sellerTenantId: string | null } | null): ProductZicht {
  if (!p) return "verborgen";
  if (p.active) return "toon";
  return p.sellerTenantId ? "verborgen" : "niet-leverbaar";
}
