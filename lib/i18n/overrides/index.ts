import type { FreelancerDict } from "@/lib/i18n/freelancer";
import type { DiepDeels } from "@/lib/i18n/talen-motor";

// Verbeteringen op een gegenereerde taal (talen-motor): een gegenereerd bestand pas je nooit met de hand aan, een betere
// vertaling zet je hier in lib/i18n/overrides/<taal>.ts (`export const overrides: DiepDeels<FreelancerDict> = { … }`)
// en je neemt de taal op in deze lijst. De motor overschrijft dit nooit. Werker-app alleen; een override wint van het
// gegenereerde bestand en het Engels.

export type OverrideLader = () => Promise<{ overrides: DiepDeels<FreelancerDict> }>;

export const OVERRIDE_LADERS: Readonly<Record<string, OverrideLader>> = {};
