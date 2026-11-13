// ---------------------------------------------------------------------------
// De poort van de werker-app in Beheer (12 nov 2026, eigenaar: "deze gegevens zijn net goedgekeurd, hoe kan het
// dat het account nog steeds onboarding moet doen"). Een goedgekeurde ID is maar één van de zes stappen van
// werkerOnboardingKlaar (lib/onboarding/werker-poort.ts); het blok "Onboarding" in Beheer is een ander lijstje (de
// trechter). Dit zet de echte poortstappen naast elkaar, met wat de werker nog moet doen. Puur: Beheer en de test.
// ---------------------------------------------------------------------------

import type { WerkerPoortFeiten } from "@/lib/onboarding/werker-poort";

export type WerkerSoort = "zzp" | "flexwerker" | "uitzendkracht" | null;

export interface PoortStap {
  key: string;
  label: string;
  ok: boolean;
  /** wat de werker nog moet doen, in gewone taal (alleen zinvol als de stap open is) */
  uitleg: string;
  /** telt niet mee voor reageren (tweestapsverificatie, sinds 12 nov optioneel) */
  optioneel?: boolean;
}

function gegevensUitleg(soort: WerkerSoort): string {
  if (soort === "uitzendkracht") return "De postcode van de thuisbasis. Het BSN en de uitzendovereenkomst komen sinds 13 nov vóór de eerste klus (reageren houdt ze tegen).";
  if (soort === "zzp") return "Btw-nummer of KVK-nummer invullen, plus de postcode van de thuisbasis.";
  if (soort === "flexwerker") return "Btw-nummer of de KOR invullen, plus de postcode van de thuisbasis.";
  return "Eerst kiezen of je zzp'er, flexwerker of uitzendkracht bent.";
}

/** De stappen die werkerOnboardingKlaar eist, in de volgorde van de onboarding. */
export function poortStappen(f: WerkerPoortFeiten, soort: WerkerSoort): PoortStap[] {
  return [
    { key: "soort", label: "Soort gekozen (zzp, flex of uitzend)", ok: f.soortGekozen, uitleg: "Kiezen of je zzp'er, flexwerker of uitzendkracht bent." },
    { key: "branches", label: "Branches gekozen", ok: f.branchesGekozen, uitleg: "Kiezen in welke branches je wilt werken." },
    { key: "gegevens", label: "Gegevens ingevuld", ok: f.gegevensIngevuld, uitleg: gegevensUitleg(soort) },
    { key: "identiteit", label: "ID ingestuurd of goedgekeurd", ok: f.identiteitIngestuurd, uitleg: "Een identiteitsbewijs insturen." },
    { key: "tweestap", label: "Tweestapsverificatie of passkey (optioneel)", ok: f.tweestapAan, uitleg: "Aanbevolen, niet verplicht: tweestapsverificatie of een passkey bij Account → Beveiliging.", optioneel: true },
    { key: "foto", label: "Profielfoto", ok: f.fotoGezet, uitleg: "Een profielfoto zetten." },
  ];
}

/** De ondertitel van het blok: of de werker al kan reageren (sinds 12 nov ziet hij de hele app altijd). */
export function poortSamenvatting(stappen: readonly PoortStap[]): string {
  const open = stappen.filter((s) => !s.ok && !s.optioneel).length;
  if (open === 0) return "Alles af: de werker kan op klussen reageren";
  return `${open} ${open === 1 ? "stap" : "stappen"} open: de werker ziet de app, maar kan nog niet reageren`;
}
