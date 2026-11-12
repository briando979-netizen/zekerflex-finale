"use client";

import type { ReactNode } from "react";
import { Portal } from "@/components/chat/Portal";
import { useDialog } from "@/components/app/useDialog";

// Een onderste sheet als dialoog (role="dialog", aria-modal, Escape, focus-trap en terug naar het
// element waar je vandaan kwam via useDialog; tikken buiten de sheet sluit). Zelfde patroon als
// components/app/LocationSheet.tsx, maar algemeen: titel + inhoud.

function Binnen({ titelId, beschrijvingId, titel, onSluit, children }: { titelId: string; beschrijvingId?: string | undefined; titel: string; onSluit: () => void; children: ReactNode }) {
  // pas aangeroepen als de sheet echt in de pagina staat, dus de focus gaat naar het eerste element
  const ref = useDialog(true, onSluit);
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

/** `beschrijvingId`: het id van de uitlegtekst in de sheet, zodat een schermlezer die bij het openen voorleest. */
export function OnderSheet({ open, titelId, beschrijvingId, titel, onSluit, children }: { open: boolean; titelId: string; beschrijvingId?: string | undefined; titel: string; onSluit: () => void; children: ReactNode }) {
  if (!open) return null;
  return (
    <Portal>
      <Binnen titelId={titelId} beschrijvingId={beschrijvingId} titel={titel} onSluit={onSluit}>
        {children}
      </Binnen>
    </Portal>
  );
}
