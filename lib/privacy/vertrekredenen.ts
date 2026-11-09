// ---------------------------------------------------------------------------
// Waarom iemand zijn account verwijdert: een vaste keuzelijst (geen vrij
// tekstveld, dus er komt geen persoonlijke informatie in). De keuze is
// vrijwillig, komt bij het verwijderen in het auditspoor en is te zien in
// Admin → Gebruikers → Verwijderde accounts. Puur bestand: het formulier
// (client) en de server delen deze lijst.
// ---------------------------------------------------------------------------

export const VERTREKREDENEN = [
  { id: "geen-werk-nodig", label: "Ik zoek geen werk meer" },
  { id: "geen-personeel-nodig", label: "Ik heb geen personeel meer nodig" },
  { id: "te-weinig-klussen", label: "Te weinig klussen bij mij in de buurt" },
  { id: "ander-platform", label: "Ik gebruik een ander platform of bureau" },
  { id: "te-ingewikkeld", label: "Het was te ingewikkeld" },
  { id: "privacy", label: "Zorgen over mijn privacy" },
  { id: "dubbel-account", label: "Ik had een tweede account" },
  { id: "anders", label: "Een andere reden" },
] as const;

export type Vertrekreden = (typeof VERTREKREDENEN)[number]["id"];

export function isVertrekreden(v: unknown): v is Vertrekreden {
  return typeof v === "string" && VERTREKREDENEN.some((r) => r.id === v);
}

export function vertrekredenLabel(id: unknown): string | null {
  return VERTREKREDENEN.find((r) => r.id === id)?.label ?? null;
}
