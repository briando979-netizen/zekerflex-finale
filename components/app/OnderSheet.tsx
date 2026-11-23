"use client";

import type { ReactNode } from "react";
import { Portal } from "@/components/chat/Portal";
import { useDialog } from "@/components/app/useDialog";

// Een onderste sheet als dialoog (role="dialog", aria-modal, Escape, focus-trap en terug naar het
// element waar je vandaan kwam via useDialog; tikken buiten de sheet sluit). Zelfde patroon als
// components/app/LocationSheet.tsx, maar algemeen: titel + inhoud.
//
// 23 nov 2026, ronde 2 van de werkgeversapp: met `vorm="venster"` is het op een laptop een breed paneel (ongeveer 640 px) met de
// titel links, een sluitknop rechtsboven, een scheidslijn eronder en minder ronde hoeken; op een telefoon blijft het de sheet
// vanaf de onderkant. Het venster staat (via de Portal) buiten de schil, dus het zet zelf data-app="werkgever": dan krijgen de
// knoppen en de randen erin dezelfde vorm als op de pagina (app/globals.css). Zonder `vorm` verandert er niets (werker-app).

interface BinnenProps {
  titelId: string;
  beschrijvingId?: string | undefined;
  titel: string;
  onSluit: () => void;
  vorm: "sheet" | "venster";
  sluitLabel: string;
  children: ReactNode;
}

function Binnen({ titelId, beschrijvingId, titel, onSluit, vorm, sluitLabel, children }: BinnenProps) {
  // pas aangeroepen als de sheet echt in de pagina staat, dus de focus gaat naar het eerste element
  const ref = useDialog(true, onSluit);
  if (vorm === "venster") {
    return (
      <div data-app="werkgever" className="app-scope fixed inset-0 z-[210] flex items-end justify-center bg-ink/50 lg:items-center lg:p-6" onClick={onSluit}>
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titelId}
          aria-describedby={beschrijvingId}
          onClick={(e) => e.stopPropagation()}
          className="flex max-h-[88vh] w-full max-w-[640px] flex-col rounded-t-2xl bg-white pb-[env(safe-area-inset-bottom)] text-ink shadow-lift lg:rounded-lg"
        >
          {/* de kop staat in de code ná de inhoud (en met order-first bovenaan in beeld): zo gaat de focus bij het openen naar het
              eerste veld en niet naar de sluitknop */}
          {children}
          <div className="order-first flex flex-shrink-0 items-center justify-between gap-4 border-b border-hair py-3 pl-6 pr-3 sm:pl-8 sm:pr-4">
            <h2 id={titelId} className="min-w-0 break-words font-display text-xl font-bold leading-snug">
              {titel}
            </h2>
            <button
              type="button"
              onClick={onSluit}
              aria-label={sluitLabel}
              title={sluitLabel}
              className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-lg text-neutralx-500 hover:bg-paper-soft hover:text-ink"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="fixed inset-0 z-[210] flex items-end justify-center bg-ink/50 lg:items-center" onClick={onSluit}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titelId}
        aria-describedby={beschrijvingId}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88vh] w-full max-w-md flex-col rounded-t-3xl bg-white pb-[env(safe-area-inset-bottom)] text-ink shadow-lift lg:rounded-3xl"
      >
        <h2 id={titelId} className="px-6 pb-2 pt-6 text-center font-display text-xl font-bold">
          {titel}
        </h2>
        {children}
      </div>
    </div>
  );
}

/**
 * `beschrijvingId`: het id van de uitlegtekst in de sheet, zodat een schermlezer die bij het openen voorleest.
 * `vorm`: "sheet" (standaard) of "venster" (het brede paneel van de werkgeversapp); `sluitLabel` is de naam van de sluitknop daarin.
 */
export function OnderSheet({
  open,
  titelId,
  beschrijvingId,
  titel,
  onSluit,
  vorm = "sheet",
  sluitLabel = "Sluiten",
  children,
}: {
  open: boolean;
  titelId: string;
  beschrijvingId?: string | undefined;
  titel: string;
  onSluit: () => void;
  vorm?: "sheet" | "venster";
  sluitLabel?: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <Portal>
      <Binnen titelId={titelId} beschrijvingId={beschrijvingId} titel={titel} onSluit={onSluit} vorm={vorm} sluitLabel={sluitLabel}>
        {children}
      </Binnen>
    </Portal>
  );
}
