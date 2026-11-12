// Welke kanten van een identiteitsbewijs we vragen. Puur bestand (ook voor de browser).
//
// Een paspoort heeft geen achterkant nodig: de foto, de naam, de geldigheid en de code onderaan (MRZ) staan allemaal
// op de pasfotopagina. Stripe vraagt bij een paspoort ook alleen die pagina. Een ID-kaart heeft de MRZ op de achterkant,
// een rijbewijs heeft er geen, maar bij beide hoort de achterkant er wel bij. De server wil twee beelden van het
// document; bij een paspoort dient de pasfotopagina ook als tweede (components/app/IdScan.tsx, OnboardingForm.tsx).
// Gemeten 11 nov 2026: een echte werker werd afgewezen met "geen foto achterkant paspoort".

/** Hoort er bij dit soort document een foto van de achterkant? */
export function heeftAchterkant(soort: string): boolean {
  return soort !== "PASSPORT";
}
