"use client";

import { useState, type ReactNode } from "react";
import { Portal } from "@/components/chat/Portal";
import { useDialog } from "@/components/app/useDialog";
import { Kruis } from "@/components/werkgever/iconen";

// Een breed venster in de werkgeversapp (23 nov 2026, zoals de profielkaart en "Actieve regio's" bij YoungOnes): tot 1000 px
// breed, de titel linksboven, het kruisje rechtsboven, een sierlijn onderaan, en de laag erachter scrolt als de inhoud langer
// is dan het scherm. Op een telefoon vult het venster de breedte. Zelfde gedrag als components/app/OnderSheet.tsx (role="dialog",
// aria-modal, Escape, focus erin en terug naar waar je vandaan kwam, tikken ernaast sluit); de smalle Dialoog blijft voor
// formulieren. Het venster hangt aan <body> (Portal), dus het neemt het thema van de app zelf over (anders blijft het licht).

function Binnen({
  titelId,
  titel,
  sluitLabel,
  onSluit,
  kop,
  voet,
  children,
}: {
  titelId: string;
  titel: string;
  sluitLabel: string;
  onSluit: () => void;
  kop?: ReactNode;
  voet?: ReactNode;
  children: ReactNode;
}) {
  const ref = useDialog(true, onSluit);
  // dit onderdeel bestaat alleen in de browser (Portal toont het pas na het laden), dus het thema is meteen te lezen
  const [thema] = useState<string | null>(() => document.querySelector(".app-scope")?.getAttribute("data-theme") ?? null);
  return (
    <div
      {...(thema ? { "data-theme": thema } : {})}
      className="app-scope fixed inset-0 z-[2000] overflow-y-auto bg-ink/50"
      onClick={onSluit}
    >
      <div className="flex min-h-full items-end justify-center sm:items-start sm:px-4 sm:py-10 lg:py-16">
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titelId}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-[1000px] rounded-t-2xl bg-white text-ink shadow-lift sm:rounded-xl"
        >
          <div className="px-5 pb-6 pt-5 sm:px-10 sm:pb-10 sm:pt-8">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                {kop}
                <h2 id={titelId} className="break-words font-display text-2xl font-bold leading-tight text-ink sm:text-3xl">
                  {titel}
                </h2>
              </div>
              <button
                type="button"
                onClick={onSluit}
                aria-label={sluitLabel}
                className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-lg border border-hairstrong bg-white text-ink hover:bg-paper-soft"
              >
                <Kruis />
              </button>
            </div>
            {children}
          </div>
          {voet}
          <div aria-hidden className="h-1.5 bg-gradient-to-r from-ink via-brand-500 to-ink sm:rounded-b-xl" />
        </div>
      </div>
    </div>
  );
}

export function BreedVenster({
  open,
  titelId,
  titel,
  sluitLabel,
  onSluit,
  kop,
  voet,
  children,
}: {
  open: boolean;
  /** het id van de titel, uniek op de pagina */
  titelId: string;
  titel: string;
  /** de naam van het kruisje voor een schermlezer */
  sluitLabel: string;
  onSluit: () => void;
  /** boven de titel, bijvoorbeeld een foto */
  kop?: ReactNode;
  /** onder de inhoud, tot de rand (een balk met knoppen; met `sticky bottom-0` blijft hij in beeld, het venster knipt niets af) */
  voet?: ReactNode;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <Portal>
      <Binnen titelId={titelId} titel={titel} sluitLabel={sluitLabel} onSluit={onSluit} kop={kop} voet={voet}>
        {children}
      </Binnen>
    </Portal>
  );
}
