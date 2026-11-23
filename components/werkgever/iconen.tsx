import type { ReactNode } from "react";

// De lijn-iconen van de kluspagina en de profielkaart in de werkgeversapp (23 nov 2026). Eigen tekeningen, geen pakket van
// buiten: één lijndikte, 24 px raster, de kleur van de tekst eromheen (currentColor). Altijd decoratief (aria-hidden): de
// knop of de regel eromheen draagt de naam. Geen hooks, dus ook een servercomponent kan ze tonen.

function Icoon({ children, maat = 20, vul = false }: { children: ReactNode; maat?: number; vul?: boolean }) {
  return (
    <svg
      aria-hidden
      focusable="false"
      width={maat}
      height={maat}
      viewBox="0 0 24 24"
      fill={vul ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={vul ? 0 : 1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="flex-shrink-0"
    >
      {children}
    </svg>
  );
}

type P = { maat?: number };

export const Kruis = ({ maat }: P) => <Icoon {...(maat ? { maat } : {})}><path d="M6 6l12 12M18 6L6 18" /></Icoon>;
export const Kalender = ({ maat }: P) => <Icoon {...(maat ? { maat } : {})}><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></Icoon>;
export const KalenderVink = ({ maat }: P) => <Icoon {...(maat ? { maat } : {})}><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4M9 15l2 2 4-4" /></Icoon>;
export const KalenderLeeg = ({ maat }: P) => <Icoon {...(maat ? { maat } : {})}><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4M9.5 15h5" /></Icoon>;
export const Klok = ({ maat }: P) => <Icoon {...(maat ? { maat } : {})}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Icoon>;
export const Wekker = ({ maat }: P) => <Icoon {...(maat ? { maat } : {})}><circle cx="12" cy="13" r="7.5" /><path d="M12 9v4l2.5 1.5M4 5l3-2.5M20 5l-3-2.5" /></Icoon>;
export const Pauze = ({ maat }: P) => <Icoon {...(maat ? { maat } : {})}><path d="M5 9h11v5a5 5 0 01-5 5h-1a5 5 0 01-5-5V9zM16 10h1.5a2.5 2.5 0 010 5H16M8 3v3M12 3v3" /></Icoon>;
export const Ketting = ({ maat }: P) => <Icoon {...(maat ? { maat } : {})}><path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.700-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" /></Icoon>;
export const Punten = ({ maat }: P) => <Icoon {...(maat ? { maat } : {})} vul><circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" /></Icoon>;
export const Trechter = ({ maat }: P) => <Icoon {...(maat ? { maat } : {})}><path d="M4 5h16l-6 7.5V19l-4-2v-4.500L4 5z" /></Icoon>;
export const Hart = ({ maat, vol = false }: P & { vol?: boolean }) => (
  <Icoon {...(maat ? { maat } : {})} vul={vol}>
    <path d="M12 20s-7-4.4-7-10a4 4 0 017-2.600A4 4 0 0119 10c0 5.600-7 10-7 10z" />
  </Icoon>
);
export const Tekstballon = ({ maat }: P) => <Icoon {...(maat ? { maat } : {})}><path d="M5 5h14a1.500 1.500 0 011.500 1.500v8A1.500 1.500 0 0119 16h-7l-4 3.500V16H5a1.500 1.500 0 01-1.500-1.500v-8A1.500 1.500 0 015 5zM8.500 10.500h.01M12 10.500h.01M15.500 10.500h.01" /></Icoon>;
export const Persoon = ({ maat }: P) => <Icoon {...(maat ? { maat } : {})}><circle cx="12" cy="8" r="3.500" /><path d="M5 20a7 7 0 0114 0" /></Icoon>;
export const Mensen = ({ maat }: P) => <Icoon {...(maat ? { maat } : {})}><circle cx="9" cy="8.500" r="3" /><path d="M3 19.500a6 6 0 0112 0M16 5.800a3 3 0 010 5.400M17.500 14.300a6 6 0 013.500 5.200" /></Icoon>;
export const Telefoon = ({ maat }: P) => <Icoon {...(maat ? { maat } : {})}><path d="M6 3.500h3l1.500 4-2 1.500a11 11 0 006.500 6.500l1.500-2 4 1.500v3a1.500 1.500 0 01-1.500 1.500A16 16 0 014.500 5 1.500 1.500 0 016 3.500z" /></Icoon>;
export const Envelop = ({ maat }: P) => <Icoon {...(maat ? { maat } : {})}><rect x="3.500" y="5.500" width="17" height="13" rx="2" /><path d="M4 7l8 6 8-6" /></Icoon>;
export const Speld = ({ maat }: P) => <Icoon {...(maat ? { maat } : {})}><path d="M12 21s-6.500-5.800-6.500-11a6.500 6.500 0 0113 0c0 5.200-6.500 11-6.500 11z" /><circle cx="12" cy="10" r="2.300" /></Icoon>;
export const Sorteer = ({ maat, richting }: P & { richting?: "op" | "af" | undefined }) => (
  <Icoon maat={maat ?? 14}>
    <path d="M8 5v14M8 5L5 8M8 5l3 3" opacity={richting === "af" ? 0.3 : 1} />
    <path d="M16 19V5M16 19l-3-3M16 19l3-3" opacity={richting === "op" ? 0.3 : 1} />
  </Icoon>
);
export const Pijl = ({ maat }: P) => <Icoon maat={maat ?? 14}><path d="M5 12h14M13 6l6 6-6 6" /></Icoon>;
/** Het pijltje van een uitklapper: omlaag = dicht, omhoog = open. */
export const Hoek =({ maat, open = false }: P & { open?: boolean }) => <Icoon maat={maat ?? 16}><path d={open ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} /></Icoon>;
export const Ster = ({ maat, vol = true }: P & { vol?: boolean }) => (
  <Icoon maat={maat ?? 16} vul={vol}>
    <path d="M12 3l2.700 5.600 6.100.900-4.400 4.300 1 6.100L12 17l-5.400 2.900 1-6.100L3.200 9.500l6.100-.900L12 3z" />
  </Icoon>
);
export const KruisRond = ({ maat }: P) => <Icoon {...(maat ? { maat } : {})}><circle cx="12" cy="12" r="8.500" /><path d="M9.500 9.500l5 5M14.500 9.500l-5 5" /></Icoon>;
export const Wissel = ({ maat }: P) => <Icoon {...(maat ? { maat } : {})}><path d="M4.500 11a7.500 7.500 0 0113-4.500L19.500 8M19.500 4v4h-4M19.500 13a7.500 7.500 0 01-13 4.500L4.500 16M4.500 20v-4h4" /></Icoon>;
export const Info = ({ maat }: P) => <Icoon maat={maat ?? 14}><circle cx="12" cy="12" r="8.500" /><path d="M12 11v5M12 8h.01" /></Icoon>;
export const Blokkeer = ({ maat }: P) => <Icoon {...(maat ? { maat } : {})}><circle cx="12" cy="12" r="8.500" /><path d="M6 6l12 12" /></Icoon>;
export const Label = ({ maat }: P) => <Icoon {...(maat ? { maat } : {})}><path d="M4 4.500h7.500l8 8-7 7-8-8V4.500z" /><circle cx="8.300" cy="8.800" r="1.200" /></Icoon>;
export const Euro = ({ maat }: P) => <Icoon {...(maat ? { maat } : {})}><path d="M17.500 6.500A6.500 6.500 0 007 12a6.500 6.500 0 0010.500 5.500M4.500 10.500h8M4.500 13.500h8" /></Icoon>;
export const Koffer = ({ maat }: P) => <Icoon {...(maat ? { maat } : {})}><rect x="3.500" y="7.500" width="17" height="12" rx="2" /><path d="M9 7.500V5.500h6v2M3.500 13h17" /></Icoon>;
export const Driehoek = ({ omlaag = false }: { omlaag?: boolean }) => (
  <Icoon maat={12} vul>
    <path d={omlaag ? "M5 8h14l-7 9-7-9z" : "M5 16h14l-7-9-7 9z"} />
  </Icoon>
);

/** Het grijze vakje met een icoon erin, zoals bij Datum, Tijd en Pauze. */
export function IcoonVak({ children }: { children: ReactNode }) {
  return <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-md bg-paper-soft text-brand-600">{children}</span>;
}
