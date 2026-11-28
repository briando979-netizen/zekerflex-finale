"use client";

import { useRouter } from "next/navigation";
import { useT } from "@/components/i18n/I18nProvider";
import { VestigingFormulier } from "@/components/werkgever/VestigingFormulier";
import { useKlusConcept } from "@/components/werkgever/useKlusConcept";
import type { LandKeuze } from "@/lib/geo/vestiging-land";

// Klus uitzetten zonder adres (22 nov 2026, gebruikersonderzoek B14–B19): een beheerder vult het adres meteen hier in, in
// één scherm, in plaats van eerst naar Locaties en terug. De plaats van een klus van /klus-plaatsen staat al klaar. Na het
// opslaan laadt de pagina opnieuw en staat het klusformulier er, met die klus ingevuld.
export function EersteVestiging({ landen = null }: { /** de vlag `werk-in-belgie` of `werk-in-buitenland`: de landen voor het adres; null = alleen Nederland */ landen?: LandKeuze[] | null }) {
  const router = useRouter();
  const t = useT().newShift;
  const concept = useKlusConcept();
  return (
    <section aria-labelledby="eerste-vestiging-kop" className="surface p-6">
      <h2 id="eerste-vestiging-kop" className="font-display text-lg font-bold text-ink">
        {t.waarKop}
      </h2>
      <p className="mt-1 text-sm text-neutralx-600">{t.noBranches}</p>
      <div className="mt-5">
        <VestigingFormulier key={concept?.city ?? ""} beginPlaats={concept?.city ?? ""} landen={landen} onOpgeslagen={() => router.refresh()} />
      </div>
    </section>
  );
}
