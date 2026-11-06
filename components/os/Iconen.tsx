import type { OsIcoon, OsTint } from "@/lib/os/apps";

// ---------------------------------------------------------------------------
// De iconen van ZekerFlex OS: eigen lijntekeningen, geen externe iconenset.
// Elk icoon staat in een vierkant met de tint van zijn categorie (één kleur =
// één betekenis: groen doen, blauw gepland, goud geld, violet vertrouwen).
// ---------------------------------------------------------------------------

const PADEN: Record<OsIcoon, React.ReactNode> = {
  werk: <path d="M4 8h16v11H4zM9 8V6a3 3 0 0 1 6 0v2M4 13h16" />,
  agenda: <path d="M4 6h16v14H4zM8 3v5M16 3v5M4 11h16" />,
  uren: <path d="M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
  geld: <path d="M3 7h18v10H3zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />,
  bank: <path d="M3 10 12 4l9 6M5 10v9M19 10v9M3 19h18M9 10v9M15 10v9" />,
  chat: <path d="M20 14a3 3 0 0 1-3 3H9l-5 4V6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3Z" />,
  mail: <path d="M3 6h18v12H3zM3 7l9 6 9-6" />,
  telefoon: <path d="M6 3h4l2 5-3 2a12 12 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 4 5a2 2 0 0 1 2-2Z" />,
  mensen: <path d="M16 19v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M9.5 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM21 19v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />,
  bedrijf: <path d="M4 21V5l8-3 8 3v16M9 21v-5h6v5M8 9h2M14 9h2M8 13h2M14 13h2" />,
  website: <path d="M3 5h18v14H3zM3 9h18M6.5 7h.01M9 7h.01" />,
  winkel: <path d="M4 8h16l-1.2 11H5.2zM9 8V6a3 3 0 0 1 6 0v2" />,
  kaart: <path d="m9 4 6 2 5-2v14l-5 2-6-2-5 2V6zM9 4v14M15 6v14" />,
  kennis: <path d="M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2zM8 7h7M8 11h7" />,
  rekenen: <path d="M5 3h14v18H5zM8 7h8M8 11h2M12 11h2M16 11h.01M8 15h2M12 15h2M16 15h.01" />,
  ai: <path d="M12 3v3M12 18v3M3 12h3M18 12h3M7 7l2 2M15 15l2 2M17 7l-2 2M9 15l-2 2M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />,
  video: <path d="M3 6h12v12H3zM15 10l6-3v10l-6-3z" />,
  groei: <path d="M4 19 10 12l4 3 6-8M20 7h-4M20 7v4" />,
  schild: <path d="M12 3 20 6v6c0 4.5-3.2 7.6-8 9-4.8-1.4-8-4.5-8-9V6zM9 12l2 2 4-4" />,
  instellingen: <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.5 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 14.6a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 7.5l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 3V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.5 1.4l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" />,
  ster: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.2-5.4-2.9-5.4 2.9 1-6.2L3.2 9.5l6.1-.9z" />,
  doos: <path d="M3 8 12 3l9 5v8l-9 5-9-5zM3 8l9 5M21 8l-9 5M12 13v8" />,
};

const TINT: Record<OsTint, string> = {
  groen: "bg-brand-500/18 text-brand-mint ring-brand-400/25",
  blauw: "bg-sky-500/18 text-sky-200 ring-sky-400/25",
  goud: "bg-amber-400/18 text-amber-200 ring-amber-300/25",
  violet: "bg-violet-500/18 text-violet-200 ring-violet-400/25",
  leisteen: "bg-white/10 text-white/80 ring-white/15",
};

/** Alleen de lijntekening, zonder vlak. */
export function OsGlyph({ icoon, maat = 22 }: { icoon: OsIcoon; maat?: number }) {
  return (
    <svg width={maat} height={maat} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PADEN[icoon]}
    </svg>
  );
}

/** Het app-icoon: lijntekening in een afgerond vlak met de tint van de categorie. */
export function OsIcoonVak({ icoon, tint, maat = "normaal" }: { icoon: OsIcoon; tint: OsTint; maat?: "klein" | "normaal" | "groot" }) {
  const vak = maat === "klein" ? "h-8 w-8 rounded-lg" : maat === "groot" ? "h-14 w-14 rounded-2xl" : "h-11 w-11 rounded-xl";
  return (
    <span className={`grid flex-shrink-0 place-items-center ring-1 ${vak} ${TINT[tint]}`}>
      <OsGlyph icoon={icoon} maat={maat === "klein" ? 17 : maat === "groot" ? 28 : 22} />
    </span>
  );
}
