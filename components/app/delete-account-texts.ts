// Teksten van het formulier "account verwijderen" (components/app/DeleteOwnAccountForm.tsx). Puur, zonder imports: de werkersapp
// en de werkgeversapp (Nederlands en Engels) gebruiken hetzelfde formulier. Het woord om te bevestigen blijft VERWIJDEREN,
// in elke taal (de actie controleert precies dat woord). {bedrijf} en {n} vult het formulier in.

export interface DeleteAccountTexts {
  typ: string;
  knop: string;
  bezig: string;
  /** de actie weigert: de enige beheerder van een bedrijf met collega's of geplande diensten (lib/privacy/bedrijf-vertrek.ts) */
  blokCollegas: string;
  blokDiensten: string;
}

export const DELETE_ACCOUNT_NL: DeleteAccountTexts = {
  typ: "Typ VERWIJDEREN om te bevestigen",
  knop: "Ja, verwijder mijn account",
  bezig: "Bezig…",
  blokCollegas:
    "Je bent de enige beheerder van {bedrijf}, en er werken nog {n} collega's mee. Maak eerst een collega beheerder (Team), dan kun je je account verwijderen.",
  blokDiensten:
    "Je bent de enige beheerder van {bedrijf}, en er staan nog {n} diensten gepland of open. Rond ze eerst af of annuleer ze, dan kun je je account verwijderen.",
};

export const DELETE_ACCOUNT_EN: DeleteAccountTexts = {
  typ: "Type VERWIJDEREN (Dutch for delete) to confirm",
  knop: "Yes, delete my account",
  bezig: "Working…",
  blokCollegas:
    "You are the only administrator of {bedrijf}, and {n} colleagues still use it. Make a colleague an administrator first (Team), then you can delete your account.",
  blokDiensten:
    "You are the only administrator of {bedrijf}, and {n} shifts are still planned or open. Finish or cancel them first, then you can delete your account.",
};
