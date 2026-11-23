import type { KvkTreffer } from "@/lib/kvk/types";

// ---------------------------------------------------------------------------
// De keuze in het zoekveld voor bedrijven (components/kvk/KvkZoeker.tsx): welke rij Enter kiest, hoe de bevestiging heet en de
// teksten in het Nederlands en Engels. Puur, zodat de test het zonder browser nalopen kan (tests/kvk-keuze.test.ts).
//
// 23 nov 2026: de eigenaar kreeg bij het aanmelden een echte stichting in zijn bedrijf zonder dat hij dat bewust koos. Een rij werd
// actief door er met de muis overheen te gaan, en Enter koos de actieve rij: Enter terwijl de muis toevallig boven een rij stond,
// koos die rij. Nu kiest Enter alleen een rij die met de pijltjestoetsen is geselecteerd, en na elke keuze staat er duidelijk wat
// er gekozen is, met een knop om opnieuw te kiezen.
// ---------------------------------------------------------------------------

export interface KvkZoekerTeksten {
  zoekPlaceholder: string;
  laden: string;
  nietGevonden: string;
  zoekOsm: string;
  bezet: string;
  aantal: string;
  nietActief: string;
  /** de bevestiging na een keuze; {bedrijf} wordt "Naam · KVK 12345678 · Plaats" */
  gekozen: string;
  /** de knop onder de bevestiging die de keuze wist en het veld leegt */
  kiesOpnieuw: string;
  /** het rustige label bij een bedrijf uit het handelsregister */
  gevondenRegister: string;
  /** het label bij een bedrijf dat alleen uit OpenStreetMap komt (geen KVK-nummer) */
  gevondenOsm: string;
}

/** Nederlandse standaard; een scherm in een andere taal geeft zijn eigen teksten mee. */
export const KVK_ZOEKER_TEKSTEN_NL: KvkZoekerTeksten = {
  zoekPlaceholder: "Naam, plaats of KVK-nummer",
  laden: "Zoeken in het handelsregister…",
  nietGevonden: "Niet gevonden? Vul zelf in.",
  zoekOsm: "Zoek ook in OpenStreetMap",
  bezet: "Het handelsregister is even niet bereikbaar. Vul zelf in.",
  aantal: "{n} bedrijven gevonden. Gebruik de pijltjestoetsen om te kiezen.",
  nietActief: "Niet actief",
  gekozen: "Gekozen: {bedrijf}",
  kiesOpnieuw: "Niet jouw bedrijf? Kies opnieuw",
  gevondenRegister: "Gevonden in het handelsregister",
  gevondenOsm: "Naam en adres uit OpenStreetMap. Vul het KVK-nummer zelf in.",
};

export const KVK_ZOEKER_TEKSTEN_EN: KvkZoekerTeksten = {
  zoekPlaceholder: "Name, place or KVK number",
  laden: "Searching the trade register…",
  nietGevonden: "Not found? Fill it in yourself.",
  zoekOsm: "Also search OpenStreetMap",
  bezet: "The trade register is briefly unavailable. Fill it in yourself.",
  aantal: "{n} companies found. Use the arrow keys to choose.",
  nietActief: "Not active",
  gekozen: "Chosen: {bedrijf}",
  kiesOpnieuw: "Not your company? Choose again",
  gevondenRegister: "Found in the trade register",
  gevondenOsm: "Name and address from OpenStreetMap. Fill in the KVK number yourself.",
};

/** De teksten bij een taal: Engels voor "en", anders de Nederlandse standaard. */
export function kvkTekstenVoor(locale: string): KvkZoekerTeksten {
  return locale === "en" ? KVK_ZOEKER_TEKSTEN_EN : KVK_ZOEKER_TEKSTEN_NL;
}

/** Hoe een rij actief werd: met de pijltjestoetsen of doordat de muis erover ging. */
export type ActiefBron = "toets" | "muis";

/**
 * Welke rij kiest Enter? Alleen een rij die met de pijltjestoetsen is geselecteerd, nooit een rij die alleen onder de muis staat
 * (of waar de muis even overheen ging). Geeft de index, of null: dan kiest Enter niets en blijft het veld gewoon vrije tekst.
 */
export function enterKiest(o: { open: boolean; actief: number; bron: ActiefBron | null; aantal: number }): number | null {
  if (!o.open || o.bron !== "toets") return null;
  return o.actief >= 0 && o.actief < o.aantal ? o.actief : null;
}

/** De rij na een pijl omlaag of omhoog, rondom de lijst; -1 als er geen rijen zijn. */
export function pijlRij(actief: number, aantal: number, omlaag: boolean): number {
  if (aantal <= 0) return -1;
  if (omlaag) return (actief + 1) % aantal;
  return actief <= 0 ? aantal - 1 : actief - 1;
}

/** "Naam · KVK 12345678 · Plaats": wat er gekozen is, zonder wat ontbreekt (een bedrijf uit OpenStreetMap heeft geen KVK-nummer). */
export function gekozenDelen(t: Pick<KvkTreffer, "name" | "kvkNumber" | "city">): string {
  return [t.name.trim(), t.kvkNumber ? `KVK ${t.kvkNumber}` : "", (t.city ?? "").trim()].filter(Boolean).join(" · ");
}

/** De volledige bevestiging onder het veld: "Gekozen: Naam · KVK 12345678 · Plaats". */
export function gekozenTekst(t: Pick<KvkTreffer, "name" | "kvkNumber" | "city">, sjabloon: string = KVK_ZOEKER_TEKSTEN_NL.gekozen): string {
  // een functie als vervanging: een naam met "$&" of "$1" blijft zoals hij is
  return sjabloon.replace("{bedrijf}", () => gekozenDelen(t));
}
