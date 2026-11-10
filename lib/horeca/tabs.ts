// De tabbladen van het horecabeheer (components/horeca/beheer/HorecaBeheer.tsx); die van een module
// alleen als die module aan staat. Ook het menu van het horecadashboard (lib/werkgever/werkruimte.ts)
// komt hieruit: elk tabblad is daar een eigen onderdeel (/werkgever/horeca?tab=<id>). Puur, zodat de
// layout (server) en het scherm (client) dezelfde lijst lezen.

export type BeheerTab = "overzicht" | "reserveringen" | "bestellingen" | "tafels" | "kassa" | "taken" | "cijfers" | "menukaart" | "schermen" | "modules" | "gegevens";

export const horecaTabs = (modules: readonly string[]): { id: BeheerTab; label: string }[] => [
  { id: "overzicht", label: "Live" },
  ...(modules.includes("reserveren") ? [{ id: "reserveringen" as const, label: "Reserveringen" }] : []),
  ...(modules.includes("bestellen")
    ? [
        { id: "bestellingen" as const, label: "Bestellingen" },
        { id: "tafels" as const, label: "Tafels & QR" },
      ]
    : []),
  ...(modules.includes("kassa") ? [{ id: "kassa" as const, label: "Kassa" }] : []),
  ...(modules.includes("taken") ? [{ id: "taken" as const, label: "Takenlijsten" }] : []),
  ...(modules.includes("bestellen") || modules.includes("reserveren") ? [{ id: "cijfers" as const, label: "Cijfers" }] : []),
  { id: "menukaart", label: "Menukaart" },
  { id: "schermen", label: "Schermen" },
  { id: "modules", label: "Modules & abonnement" },
  { id: "gegevens", label: "Gegevens & openingstijden" },
];
