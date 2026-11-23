import type { OrgProfileExtra } from "@/lib/profile/store";

// ---------------------------------------------------------------------------
// Is het bedrijfsprofiel af? Eén regel voor de stip bij "Instellingen" in de zijbalk (components/app/EmployerShell.tsx), de stip op
// de kaart "Jouw bedrijfsprofiel" en de kaart "Voeg een omslagfoto toe" op /werkgever/instellingen (eigenaar, 23 nov 2026: zoals de
// rode stip bij YoungOnes). Puur: geen prisma of kv, dus ook voor een clientbestand.
// Een omslagfoto is de enige eis: de rest van het profiel (website, omschrijving) is bewust optioneel.
// ---------------------------------------------------------------------------

/** Heeft het bedrijf een omslagfoto, of koos het bij het aanmelden bewust om die stap over te slaan? */
export function heeftOmslagfoto(extra: Pick<OrgProfileExtra, "photoUploadId" | "onboarding">): boolean {
  return Boolean(extra.photoUploadId || extra.onboarding?.coverStepDone);
}

/** Het bedrijfsprofiel is nog niet af zolang er geen omslagfoto is. */
export function bedrijfsprofielOnvolledig(extra: Pick<OrgProfileExtra, "photoUploadId" | "onboarding">): boolean {
  return !heeftOmslagfoto(extra);
}
