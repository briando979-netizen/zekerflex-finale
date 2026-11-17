// ---------------------------------------------------------------------------
// De poort van de werker-app in Beheer (12 nov 2026, eigenaar: "deze gegevens zijn net goedgekeurd, hoe kan het
// dat het account nog steeds onboarding moet doen"). Een goedgekeurde ID is maar één van de stappen van
// werkerOnboardingKlaar (lib/onboarding/werker-poort.ts); het blok "Onboarding" in Beheer is een ander lijstje (de
// trechter). Dit zet de echte poortstappen naast elkaar, met wat de werker nog moet doen. Puur: Beheer en de test.
// ---------------------------------------------------------------------------

import type { WerkerPoortFeiten } from "@/lib/onboarding/werker-poort";
import type { KlusFeiten } from "@/lib/onboarding/klaar-voor-klus";

export type WerkerSoort = "zzp" | "flexwerker" | "uitzendkracht" | null;

export interface PoortStap {
  key: string;
  label: string;
  ok: boolean;
  /** wat de werker nog moet doen, in gewone taal (alleen zinvol als de stap open is) */
  uitleg: string;
  /** telt niet mee voor reageren (tweestapsverificatie, sinds 12 nov optioneel) */
  optioneel?: boolean;
  /** hoort bij "Vóór de eerste klus" (na de 5 stappen van de aanmelding) */
  eersteKlus?: boolean;
}

function gegevensUitleg(soort: WerkerSoort): string {
  if (soort === "uitzendkracht") return "De postcode van de thuisbasis. Het BSN en de uitzendovereenkomst komen sinds 13 nov vóór de eerste klus (reageren houdt ze tegen).";
  if (soort === "zzp" || soort === "flexwerker") return "Naam, geboortedatum, telefoon en de postcode van de thuisbasis. Het KVK- of btw-nummer (of de KOR) en het rekeningnummer komen sinds 13 nov vóór de eerste klus.";
  return "Eerst kiezen of je zzp'er, flexwerker of uitzendkracht bent.";
}

/** De stappen die werkerOnboardingKlaar eist, in de volgorde van de onboarding. */
export function poortStappen(f: WerkerPoortFeiten, soort: WerkerSoort): PoortStap[] {
  return [
    { key: "soort", label: "Soort gekozen (zzp, flex of uitzend)", ok: f.soortGekozen, uitleg: "Kiezen of je zzp'er, flexwerker of uitzendkracht bent." },
    { key: "branches", label: "Branches gekozen", ok: f.branchesGekozen, uitleg: "Kiezen in welke branches je wilt werken." },
    { key: "gegevens", label: "Gegevens ingevuld", ok: f.gegevensIngevuld, uitleg: gegevensUitleg(soort) },
    { key: "identiteit", label: "ID ingestuurd of goedgekeurd", ok: f.identiteitIngestuurd, uitleg: "Een identiteitsbewijs insturen." },
    { key: "foto", label: "Profielfoto", ok: f.fotoGezet, uitleg: "Een profielfoto zetten." },
    { key: "tweestap", label: "Tweestapsverificatie of passkey (optioneel)", ok: f.tweestapAan, uitleg: "Aanbevolen, niet verplicht: tweestapsverificatie of een passkey bij Account → Beveiliging.", optioneel: true },
  ];
}

/**
 * Na de 5 stappen: wat reageren nog tegenhoudt, met dezelfde feiten als de kaart "Klaar voor je eerste klus" van de werker
 * (lib/onboarding/klaar-voor-klus.ts, de regels van payoutEligibility).
 */
export function klusStappen(k: KlusFeiten): PoortStap[] {
  const rijen: PoortStap[] = [];
  if (k.payroll) {
    rijen.push({ key: "bsn", label: "BSN", ok: k.bsn, uitleg: "Het BSN invullen (Verificatie, blok Voor je eerste klus).", eersteKlus: true });
    rijen.push({ key: "contract", label: "Uitzendovereenkomst getekend", ok: k.contract, uitleg: "De uitzendovereenkomst lezen en tekenen (Verificatie).", eersteKlus: true });
  } else {
    rijen.push({
      key: "bedrijf",
      label: "KVK-, btw-nummer of KOR",
      ok: k.bedrijf,
      uitleg: k.kvkWacht ? "Het KVK-nummer is ingevuld; de controle bij de KVK wacht nog (gaat vanzelf opnieuw)." : "Een geldig KVK- of btw-nummer, of de KOR (Verificatie).",
      eersteKlus: true,
    });
  }
  rijen.push({ key: "iban", label: "Rekeningnummer (IBAN)", ok: k.iban, uitleg: "Het rekeningnummer invullen (Verificatie, Bankrekening).", eersteKlus: true });
  if (k.werkrechtOpen) rijen.push({ key: "werkrecht", label: "Recht om te werken", ok: false, uitleg: "De verklaring aanvinken (vlag werkrecht-eis staat aan).", eersteKlus: true });
  rijen.push({ key: "idGoedgekeurd", label: "ID goedgekeurd", ok: k.idGoedgekeurd, uitleg: "Het ingestuurde ID moet nog worden nagekeken.", eersteKlus: true });
  return rijen;
}

/** De ondertitel van het blok: of de werker al kan reageren (sinds 12 nov ziet hij de hele app altijd). */
export function poortSamenvatting(stappen: readonly PoortStap[]): string {
  const open = stappen.filter((s) => !s.ok && !s.optioneel).length;
  if (open === 0) return "Alles af: de werker kan op klussen reageren";
  return `${open} ${open === 1 ? "stap" : "stappen"} open: de werker ziet de app, maar kan nog niet reageren`;
}
