// ---------------------------------------------------------------------------
// Tweestapsverificatie met codes uit een authenticator-app staat uit (21 nov 2026,
// eigenaar: "haal alle tweestapsverificatie weg, hoeft niet"). Niemand krijgt na
// het wachtwoord nog een codestap, ook wie het eerder aanzette; de schermen om het
// aan te zetten zijn weg. Inloggen gaat met wachtwoord, Google/Apple of een passkey
// (die vraagt zelf vingerafdruk, gezicht of pincode). De code zelf blijft staan
// (lib/auth/two-factor.ts, components/auth/TwoFactorSettings.tsx): met `true` komt
// alles terug. Puur bestand: ook bruikbaar in client-onderdelen.
// ---------------------------------------------------------------------------

export const TWEESTAP_AAN = false;
