// ---------------------------------------------------------------------------
// Is ZekerFlex zelf uitzender? Nee, sinds 21 nov 2026 (eigenaar: "verander alles", na de keuze voor uitzendpartners zoals
// YoungCapital bij YoungOnes). Uitzenden loopt alleen nog via aangesloten uitzendbureaus (lib/uitzend/partners-kern.ts):
// het bureau is de werkgever en verloont zelf. Gevolgen als dit uit staat:
// - een gewoon bedrijf kan geen klus "via het uitzendbureau" meer plaatsen (lib/shifts/create.ts, het klusformulier);
// - een uitzendkracht reageert alleen op klussen van een uitzendpartner (lib/fiscal/eligibility.ts, lib/matching/*),
//   en ZekerFlex vraagt hem geen BSN of eigen uitzendovereenkomst meer (lib/onboarding/klaar-voor-klus.ts);
// - de app noemt ZekerFlex nergens meer werkgever.
// Het eigen uitzendspoor (verloning, loonstroken, StiPP) blijft in de code staan: met `true` komt het terug.
// Achtergrond: zonder eigen Wtta-toelating mag ZekerFlex vanaf 2028 niet zelf uitlenen. Puur bestand: ook in de browser.
// ---------------------------------------------------------------------------

export const ZEKERFLEX_UITZENDER = false;
