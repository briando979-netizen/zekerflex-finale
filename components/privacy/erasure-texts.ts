// De vaste teksten van ErasureScopeInfo (components/privacy/ErasureScopeInfo.tsx). Puur, zonder imports: Nederlands is de
// standaard (openbare pagina, werkgeversapp in het Nederlands); de werker-app en de Engelse werkgeversapp geven hun eigen taal mee.

export type ErasureTeksten = {
  wisNu: string;
  bewaard: string;
  bewaardTot: string;
  bewaardVoet: string;
  /** de omschrijving per gegevenssoort (sleutel uit lib/privacy/retention.ts) in de taal van de app; zonder: de Nederlandse uit die lijst */
  wisOnderdelen?: Readonly<Record<string, string>> | undefined;
  /** waarom een gegevenssoort nog bewaard blijft, per sleutel, in de taal van de app; zonder: de Nederlandse */
  wisGronden?: Readonly<Record<string, string>> | undefined;
};

export const ERASURE_NL: ErasureTeksten = {
  wisNu: "Wordt meteen verwijderd of geanonimiseerd:",
  bewaard: "Blijft nog even bewaard (wettelijke bewaarplicht):",
  bewaardTot: "{label} — tot {jaar} jaar, {basis}",
  bewaardVoet: "Deze gegevens worden niet gekoppeld aan een werkend account: je kunt niet meer inloggen en je naam, e-mailadres en telefoonnummer zijn al verwijderd.",
};
