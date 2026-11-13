"use client";

// De donkere verloopkop van het stappenscherm: terugknop links, voortgangsstreepjes in het midden,
// sluitknop rechts (alleen waar sluiten mag), daaronder de grote kop. Eigen klassen, zoals het
// mobiele loginscherm (components/auth/AuthShell.tsx): ze hangen niet af van het thema van de app.

export function WieBenJijKop({
  titel,
  uitleg,
  aantal,
  huidig,
  teksten,
  onTerug,
  onSluit,
  stapNaam,
}: {
  titel: string;
  uitleg?: string | undefined;
  /** het echte aantal stappen van deze werker */
  aantal: number;
  /** 0-gebaseerd */
  huidig: number;
  teksten: { terug: string; sluiten: string; stapVan: string };
  onTerug: () => void;
  /** zonder: niet sluitbaar (de verplichte poort) */
  onSluit?: (() => void) | undefined;
  /** de naam van de stap in de hele aanmelding ("Je gegevens", "Je ID"): dan staat "Stap n van 5: …" boven de kop */
  stapNaam?: string | undefined;
}) {
  const knop =
    "grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";
  return (
    <div className="bg-[linear-gradient(165deg,#0B3B3A_0%,#0E5C4A_55%,#0C0E12_100%)] px-5 pb-9 pt-[max(1.25rem,env(safe-area-inset-top))] text-white">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={onTerug} aria-label={teksten.terug} className={knop}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div
          role="progressbar"
          aria-label={teksten.stapVan.replace("{n}", String(huidig + 1)).replace("{totaal}", String(aantal))}
          aria-valuemin={1}
          aria-valuemax={aantal}
          aria-valuenow={huidig + 1}
          className="flex flex-1 justify-center gap-2"
        >
          {Array.from({ length: aantal }, (_, i) => (
            <span key={i} aria-hidden className={`h-1.5 w-10 rounded-full ${i <= huidig ? "bg-white" : "bg-white/25"}`} />
          ))}
        </div>
        {onSluit ? (
          <button type="button" onClick={onSluit} aria-label={teksten.sluiten} className={knop}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
        ) : (
          <span aria-hidden className="h-10 w-10" />
        )}
      </div>
      {stapNaam && (
        <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-white/75">
          {teksten.stapVan.replace("{n}", String(huidig + 1)).replace("{totaal}", String(aantal))}: {stapNaam}
        </p>
      )}
      <h1 className={`${stapNaam ? "mt-1.5" : "mt-6"} font-display text-3xl font-bold leading-tight`}>{titel}</h1>
      {uitleg && <p className="mt-1.5 text-sm text-white/80">{uitleg}</p>}
    </div>
  );
}
