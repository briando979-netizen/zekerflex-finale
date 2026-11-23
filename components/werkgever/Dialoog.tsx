"use client";

import type { FormEvent, ReactNode } from "react";
import { OnderSheet } from "@/components/app/OnderSheet";
import { DIALOOG_ACTIES } from "@/components/werkgever/bouwstenen";

// De dialoog van de werkgeversapp (23 nov 2026, zoals "Kostenplaats toevoegen" bij YoungOnes): een titel, een regel uitleg, de
// velden, en onderaan de hoofdknop met Annuleren. Op een laptop een breed paneel (ongeveer 640 px) met de titel links, een
// sluitknop rechtsboven en een scheidslijn; op een telefoon een sheet vanaf de onderkant (vorm="venster" van OnderSheet). Het
// is het bestaande patroon van components/app/OnderSheet.tsx (role="dialog", aria-modal, Escape, focus erin en terug naar waar je
// vandaan kwam, tikken ernaast sluit) met één vaste indeling eromheen.
// Met `onVerstuur` staan de velden en de knoppen samen in één formulier (Enter verstuurt); zet er dus nooit zelf nog een formulier in.

export function Dialoog({
  open,
  id,
  titel,
  uitleg,
  onSluit,
  onVerstuur,
  acties,
  sluitLabel,
  children,
}: {
  open: boolean;
  /** een eigen voorvoegsel voor de id's in deze dialoog (titel en uitleg), uniek op de pagina */
  id: string;
  titel: string;
  uitleg?: string | undefined;
  onSluit: () => void;
  /** maakt van de dialoog één formulier */
  onVerstuur?: ((e: FormEvent<HTMLFormElement>) => void) | undefined;
  /** de knoppen onderaan: Annuleren eerst, de hoofdknop als laatste; zonder als de inhoud een formulier met eigen knoppen is */
  acties?: ReactNode;
  /** de naam van de sluitknop rechtsboven, in de taal van de app (standaard "Sluiten") */
  sluitLabel?: string | undefined;
  children?: ReactNode;
}) {
  const uitlegId = uitleg ? `${id}-uitleg` : undefined;
  const binnen = (
    <>
      <div className={`min-h-0 overflow-y-auto px-6 pt-5 sm:px-8 ${acties ? "pb-2" : "pb-6"}`}>
        {uitleg ? (
          <p id={uitlegId} className="text-sm leading-relaxed text-neutralx-600">
            {uitleg}
          </p>
        ) : null}
        {children}
      </div>
      {acties ? <div className={DIALOOG_ACTIES}>{acties}</div> : null}
    </>
  );
  return (
    <OnderSheet open={open} titelId={`${id}-titel`} beschrijvingId={uitlegId} titel={titel} onSluit={onSluit} vorm="venster" {...(sluitLabel ? { sluitLabel } : {})}>
      {onVerstuur ? (
        <form onSubmit={onVerstuur} noValidate className="flex min-h-0 flex-col">
          {binnen}
        </form>
      ) : (
        binnen
      )}
    </OnderSheet>
  );
}
