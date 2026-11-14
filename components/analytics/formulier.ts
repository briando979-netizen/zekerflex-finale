"use client";

import { trackEvent } from "@/components/analytics/AnalyticsBeacon";
import { eersteMelding, formulierLabel, type FormulierNaam } from "@/lib/analytics/formulier-meting";

// De formulierknoppen melden anoniem of de melding "Vul nog in" verscheen en of er echt is verstuurd
// (lib/analytics/formulier-meting.ts). Eén melding per veld per sessie: de lijst staat in sessionStorage,
// zodat een herlaadde pagina niet opnieuw telt; zonder opslag telt alleen deze paginalading.

const OPSLAG = "zf-formulier-melding";
let geheugen: Set<string> | null = null;

function gezien(): Set<string> {
  if (geheugen) return geheugen;
  geheugen = new Set<string>();
  try {
    const raw = sessionStorage.getItem(OPSLAG);
    if (raw) for (const l of JSON.parse(raw) as unknown[]) if (typeof l === "string") geheugen.add(l);
  } catch {
    /* geen sessionStorage: dan alleen deze paginalading */
  }
  return geheugen;
}

function bewaar(set: Set<string>): void {
  try {
    sessionStorage.setItem(OPSLAG, JSON.stringify([...set]));
  } catch {
    /* privémodus of vol: niet erg */
  }
}

/** De melding "Vul nog in" verscheen voor dit veld. */
export function meldOntbreekt(formulier: FormulierNaam, veld: string): void {
  const set = gezien();
  if (!eersteMelding(set, formulier, veld)) return;
  bewaar(set);
  trackEvent("INTERACTION", formulierLabel(formulier, "melding", veld) ?? undefined);
}

/** Het formulier is echt verstuurd. */
export function meldVerstuurd(formulier: FormulierNaam): void {
  trackEvent("INTERACTION", formulierLabel(formulier, "verstuurd") ?? undefined);
}
