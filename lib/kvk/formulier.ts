import type { KvkTreffer } from "@/lib/kvk/types";

// ---------------------------------------------------------------------------
// Van een gekozen bedrijf naar de velden van een formulier. Puur, zodat zowel
// het aanmeldformulier als de onboarding-wizard dezelfde invulling krijgen en
// de test hem zonder browser kan nalopen.
// ---------------------------------------------------------------------------

/** Welke gegevens van het bedrijf er in een formulierveld kunnen. */
export type VulSleutel = "name" | "kvk" | "address" | "street" | "houseNumber" | "postalCode" | "city" | "vat";

/** Veldnaam in het formulier per gegeven; laat weg wat het formulier niet heeft. */
export type VulKaart = Partial<Record<VulSleutel, string>>;

/** De waarde per gegeven; een leeg of onbekend gegeven ontbreekt (zo wist het nooit wat de bezoeker al typte). */
export function vulWaarden(t: KvkTreffer): Partial<Record<VulSleutel, string>> {
  const uit: Partial<Record<VulSleutel, string>> = { name: t.name };
  if (t.kvkNumber) uit.kvk = t.kvkNumber;
  if (t.street) {
    uit.street = t.street;
    uit.address = [t.street, t.houseNumber].filter(Boolean).join(" ");
  }
  if (t.houseNumber) uit.houseNumber = t.houseNumber;
  if (t.postalCode) uit.postalCode = t.postalCode;
  if (t.city) uit.city = t.city;
  if (t.vatNumber) uit.vat = t.vatNumber;
  return uit;
}

/** Het rustige label bij een gekozen bedrijf: alleen "handelsregister" als het echt daaruit komt. */
export function keuzeLabel(t: KvkTreffer): { tekst: string; register: boolean } {
  return t.source === "register"
    ? { tekst: "Gevonden in het handelsregister", register: true }
    : { tekst: "Naam en adres uit OpenStreetMap. Vul het KVK-nummer zelf in.", register: false };
}

/** "Utrecht · KVK 12345678 · Besloten vennootschap" voor onder de naam in de lijst. */
export function regelOnder(t: KvkTreffer): string {
  return [t.city, t.legalForm].filter(Boolean).join(" · ");
}
