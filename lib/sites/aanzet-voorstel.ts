import type { Company } from "@/lib/sites/types";

// De eerste stap van het rijschool- en het horecapakket ("Aanzetten") staat al ingevuld met wat het
// bedrijf ZekerFlex al gaf (companyDefaults in lib/sites/access.ts): naam, plaats, adres en KVK-nummer
// uit de inschrijving, het telefoonnummer en e-mailadres van wie hem aanzet. Wat we niet weten, blijft
// leeg; de beheerder past alles aan. Puur, zodat de routes en de schermen hetzelfde type lezen.

export interface AanzetVoorstel {
  naam: string;
  plaats: string;
  /** "Straat 1, 1234 AB", zoals het veld Adres van rijschool en zaak; de plaats staat los */
  adres: string;
  /** acht cijfers of leeg: een ander KVK-nummer keurt het formulier af */
  kvk: string;
  telefoon: string;
  email: string;
}

export const aanzetVoorstel = (d: Company): AanzetVoorstel => ({
  naam: d.naam,
  plaats: d.plaats,
  adres: [d.straat, d.postcode]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(", "),
  kvk: /^\d{8}$/.test(d.kvk) ? d.kvk : "",
  telefoon: d.telefoon,
  email: d.email,
});
