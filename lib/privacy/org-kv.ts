// ---------------------------------------------------------------------------
// Register van de KV-gegevens die bij een ORGANISATIE horen (en niet bij één gebruiker): werkbonnen, offertes,
// checklists, voorraad, kamers, ritten, lidmaatschappen en afspraken/klantenkaart. Klantgegevens van een bedrijf zijn
// gegevens van derden; verdwijnt de organisatie, dan moeten ze mee weg (AVG art. 17) en horen ze in een export.
// Een nieuwe module met KV-gegevens per organisatie meldt zich HIER aan (één regel per voorvoegsel); tests/org-kv.test.ts
// leest de store-bestanden en laat een vergeten voorvoegsel direct opvallen. Puur bestand: geen prisma of kv.
// De gebruikersgebonden sleutels staan in lib/privacy/user-kv.ts (ERASABLE_KV_PREFIXES).
// ---------------------------------------------------------------------------

/**
 * Hoe een sleutel bij de organisatie hoort:
 *  - "organisatie": `<voorvoegsel><orgId>:…` (alles daaronder is van de organisatie);
 *  - "exact":       precies `<voorvoegsel><orgId>` (één rij, geen opvolgers);
 *  - "verwijzing":  `<voorvoegsel><hash of naam>`: een openbaar opzoekrijtje buiten de organisatie, met `tenantId` in de waarde.
 */
export type OrgKvSoort = "organisatie" | "exact" | "verwijzing";

export interface OrgKvRegel {
  /** de module (map in lib/) */
  module: string;
  /** de eerste twee delen van de sleutel, met afsluitende dubbele punt, bv. "werkbonnen:item:" */
  voorvoegsel: string;
  soort: OrgKvSoort;
  /** wat er in zit, in gewoon Nederlands (voor beheer en de export) */
  omschrijving: string;
}

export const ORG_KV_REGISTER: readonly OrgKvRegel[] = [
  { module: "werkbonnen", voorvoegsel: "werkbonnen:item:", soort: "organisatie", omschrijving: "werkbonnen met klantgegevens" },
  { module: "werkbonnen", voorvoegsel: "werkbonnen:teller:", soort: "organisatie", omschrijving: "nummerteller per jaar" },
  { module: "werkbonnen", voorvoegsel: "werkbonnen:nr:", soort: "organisatie", omschrijving: "nummerclaims" },
  { module: "werkbonnen", voorvoegsel: "werkbonnen:team:", soort: "exact", omschrijving: "namen van het team" },

  { module: "offertes", voorvoegsel: "offertes:item:", soort: "organisatie", omschrijving: "offertes met klantgegevens" },
  { module: "offertes", voorvoegsel: "offertes:nr:", soort: "organisatie", omschrijving: "nummerclaims" },
  { module: "offertes", voorvoegsel: "offertes:token:", soort: "verwijzing", omschrijving: "openbare offertelinks (alleen de hash)" },

  { module: "checklists", voorvoegsel: "checklist:sjabloon:", soort: "organisatie", omschrijving: "checklistsjablonen" },
  { module: "checklists", voorvoegsel: "checklist:uitv:", soort: "organisatie", omschrijving: "ingevulde checklists met naam van de uitvoerder" },
  { module: "checklists", voorvoegsel: "checklist:link:", soort: "verwijzing", omschrijving: "openbare invullinks (alleen de hash)" },

  { module: "voorraad", voorvoegsel: "voorraad:art:", soort: "organisatie", omschrijving: "artikelen en voorraadstanden" },
  { module: "voorraad", voorvoegsel: "voorraad:log:", soort: "organisatie", omschrijving: "voorraadmutaties" },

  { module: "kamers", voorvoegsel: "kamers:kamer:", soort: "organisatie", omschrijving: "kamers" },
  { module: "kamers", voorvoegsel: "kamers:boeking:", soort: "organisatie", omschrijving: "boekingen met gastgegevens" },
  { module: "kamers", voorvoegsel: "kamers:teller:", soort: "organisatie", omschrijving: "nummerteller per jaar" },
  { module: "kamers", voorvoegsel: "kamers:nr:", soort: "organisatie", omschrijving: "nummerclaims" },

  { module: "ritten", voorvoegsel: "ritten:rit:", soort: "organisatie", omschrijving: "ritten met adressen en klantnamen" },
  { module: "ritten", voorvoegsel: "ritten:teller:", soort: "organisatie", omschrijving: "nummerteller per jaar" },
  { module: "ritten", voorvoegsel: "ritten:nr:", soort: "organisatie", omschrijving: "nummerclaims" },
  { module: "ritten", voorvoegsel: "ritten:voertuig:", soort: "organisatie", omschrijving: "voertuigen met kenteken" },
  { module: "ritten", voorvoegsel: "ritten:chauffeurs:", soort: "exact", omschrijving: "namen van chauffeurs" },

  { module: "lidmaatschappen", voorvoegsel: "lidmaatschappen:vorm:", soort: "organisatie", omschrijving: "soorten lidmaatschap" },
  { module: "lidmaatschappen", voorvoegsel: "lidmaatschappen:lid:", soort: "organisatie", omschrijving: "leden met persoonsgegevens" },
  { module: "lidmaatschappen", voorvoegsel: "lidmaatschappen:lm:", soort: "organisatie", omschrijving: "lidmaatschappen van leden" },
  { module: "lidmaatschappen", voorvoegsel: "lidmaatschappen:bezoek:", soort: "organisatie", omschrijving: "bezoeken van leden" },
  { module: "lidmaatschappen", voorvoegsel: "lidmaatschappen:nr:", soort: "organisatie", omschrijving: "nummerclaims" },
  { module: "lidmaatschappen", voorvoegsel: "lidmaatschappen:teller:", soort: "exact", omschrijving: "ledennummerteller" },

  { module: "afspraken", voorvoegsel: "afspraken:inst:", soort: "exact", omschrijving: "instellingen en boekpagina" },
  { module: "afspraken", voorvoegsel: "afspraken:slug:", soort: "verwijzing", omschrijving: "boekadres van de organisatie" },
  { module: "afspraken", voorvoegsel: "afspraken:item:", soort: "organisatie", omschrijving: "afspraken met klantgegevens" },
  { module: "afspraken", voorvoegsel: "afspraken:klant:", soort: "organisatie", omschrijving: "klantenkaart (notities per klant)" },
  { module: "afspraken", voorvoegsel: "afspraken:tok:", soort: "organisatie", omschrijving: "annuleerlinks (alleen de hash)" },
  { module: "afspraken", voorvoegsel: "afspraken:rem:", soort: "organisatie", omschrijving: "herinneringsrijtje" },
];

/** Een echt organisatie-id: zo kan een leeg of vreemd id nooit een te breed voorvoegsel worden. */
export const ORGANISATIE_ID = /^[A-Za-z0-9_-]{6,64}$/;

/** De sleutel of het voorvoegsel waaronder deze regel de gegevens van deze organisatie bewaart (niet voor "verwijzing"). */
export function orgSleutel(regel: OrgKvRegel, orgId: string): string {
  return regel.soort === "exact" ? `${regel.voorvoegsel}${orgId}` : `${regel.voorvoegsel}${orgId}:`;
}
