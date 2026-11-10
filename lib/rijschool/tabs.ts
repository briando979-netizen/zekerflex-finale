// De tabbladen van het rijschoolbeheer (components/rijschool/beheer/RijschoolBeheer.tsx). Ook het menu
// van het rijschooldashboard (lib/werkgever/werkruimte.ts) komt hieruit: elk tabblad is daar een eigen
// onderdeel (/werkgever/rijschool?tab=<id>). Puur, zodat de layout (server) en het scherm (client)
// dezelfde lijst lezen.

export type RijschoolTab = "overzicht" | "agenda" | "leerlingen" | "berichten" | "betalingen" | "team" | "pakketten" | "website" | "instellingen" | "app";

export const RIJSCHOOL_TABS: readonly { id: RijschoolTab; label: string }[] = [
  { id: "overzicht", label: "Overzicht" },
  { id: "agenda", label: "Agenda" },
  { id: "leerlingen", label: "Leerlingen" },
  { id: "berichten", label: "Berichten" },
  { id: "betalingen", label: "Betalingen" },
  { id: "team", label: "Instructeurs en auto's" },
  { id: "pakketten", label: "Pakketten en prijzen" },
  { id: "website", label: "Website" },
  { id: "instellingen", label: "Instellingen" },
  { id: "app", label: "App" },
];

export const isRijschoolTab = (s: unknown): s is RijschoolTab => typeof s === "string" && RIJSCHOOL_TABS.some((t) => t.id === s);
