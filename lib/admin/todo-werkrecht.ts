// ---------------------------------------------------------------------------
// Eigenaar-taak (14 nov 2026): de vlag werkrecht-eis (lib/flags, lib/werkrecht/store.ts werkrechtEisAan en werkrechtVoorWerk).
// Uit (standaard sinds 10 nov) = er wordt niets gevraagd of geblokkeerd. Aan = een werker moet vóór het reageren op of
// aannemen van een klus eerst verklaren dat hij in Nederland mag werken en zo nodig een bewijs laten zien. Een paspoort of
// ID-kaart uit de EU/EER/CH dat met de eigen ID-scan van ZekerFlex is goedgekeurd, telt vanzelf (geen extra vraag).
// De taak vinkt zichzelf af zodra de vlag aan staat. Puur: alleen de stand van de vlag. Geen rechts- of belastingadvies:
// de eigenaar laat de boete en het moment bevestigen door een accountant of jurist.
// ---------------------------------------------------------------------------

import type { OwnerTodo } from "@/lib/admin/owner-todos";

/** De taak bij de stand van de vlag; `undefined` = niet kunnen lezen (dan geen taak, om niets vals te tonen). */
export function werkrechtEisTodo(vlagAan: boolean | undefined): OwnerTodo | null {
  if (vlagAan === undefined) return null;
  return {
    id: "werkrecht-eis",
    group: "Juridisch",
    title: "Recht om te werken controleren vóór de eerste echte klus",
    why: "De vlag werkrecht-eis bepaalt of werkers hun recht om te werken moeten laten zien. Staat de vlag uit (nu standaard), dan wordt er niets gevraagd en niets geblokkeerd. Staat hij aan, dan moet een werker vóór hij reageert op of een klus aanneemt eerst verklaren dat hij in Nederland mag werken en, als dat nodig is, een bewijs laten zien. De boete (Wav) kan tot € 8.000 per werker zijn; laat dit bevestigen door je accountant of jurist.",
    how: [
      "Vraag je accountant of jurist wanneer de controle aan moet staan, en laat hem bevestigen dat dit klopt voor jouw situatie.",
      "Zet de vlag werkrecht-eis aan in Beheer → Systeem → tab Functies aan en uit, bij Recht om te werken vragen vóór een klus.",
      "Werkers uit de EU, de EER of Zwitserland met een ID-scan van ZekerFlex zijn daarna vanzelf in orde en krijgen geen extra vraag. Dat geldt alleen voor een ID dat met onze eigen scan is gecontroleerd en goedgekeurd.",
      "Alleen werkers van buiten de EU geven een bewijs (bijvoorbeeld een verblijfsdocument of werkvergunning); een medewerker keurt dat goed of af.",
      "Deze taak vinkt zichzelf af zodra de vlag aan staat.",
    ],
    auto: true,
    eerst: { reden: "wettelijk" },
    done: vlagAan,
    ...(vlagAan ? { doneNote: "de vlag werkrecht-eis staat aan" } : {}),
  };
}
