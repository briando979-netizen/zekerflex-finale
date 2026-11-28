import { vt } from "@/lib/i18n/site";

// ---------------------------------------------------------------------------
// De vaste zinnen van de kop en het mobiele menu van de openbare site (28 nov 2026). Die twee zijn clientonderdelen: zij
// mogen geen vertaalfunctie van de server krijgen, dus de server vertaalt deze zinnen (en die van het menu) en geeft ze als
// gewone data mee (components/marketing/SiteTaal.tsx). Daarom staan ze hier bij elkaar, met vt("…") voor het zoekscript.
// Puur bestand: de kop zelf importeert het ook.
// ---------------------------------------------------------------------------

export const KOP_TEKSTEN = {
  hoofdnavigatie: vt("Hoofdnavigatie"),
  submenu: vt("{naam} submenu"),
  werkersOfBedrijven: vt("Werkers of bedrijven"),
  werkers: vt("Werkers"),
  bedrijven: vt("Bedrijven"),
  menu: vt("Menu"),
  klaar: vt("Klaar om te beginnen?"),
  ikZoekAls: vt("Ik ben op zoek als"),
  onderdelen: vt("Onderdelen"),
  ikZoekWerk: vt("Ik zoek werk"),
  openKlussen: vt("Open klussen"),
  startenAlsFreelancer: vt("Starten als freelancer"),
  naar: vt("Naar {naam}"),
  taal: vt("Taal"),
  vragen: vt("Vragen? Mail {mail} of kijk bij {contact}."),
  contact: vt("contact"),
} as const;
