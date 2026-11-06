// ---------------------------------------------------------------------------
// De tabbladen van Werkgever → Op locatie. Puur en los, want de pagina
// (server) leest ?tab= en het scherm (client) tekent de tabs. Stond dit in het
// clientbestand, dan roept de server een functie aan die alleen in de browser
// bestaat: "Attempted to call isTab() from the server" — en de pagina valt om.
// ---------------------------------------------------------------------------

export type Tab = "overzicht" | "portofoon" | "toegang" | "kluis" | "printen";

export const TABS: { key: Tab; label: string }[] = [
  { key: "overzicht", label: "Overzicht" },
  { key: "portofoon", label: "Portofoon" },
  { key: "toegang", label: "Toegang" },
  { key: "kluis", label: "Sleutelkluis" },
  { key: "printen", label: "Badges en labels" },
];

export const isTab = (s: unknown): s is Tab => TABS.some((t) => t.key === s);
