// Teksten voor de deel-link van een uitje (groepsuitnodiging). Puur, ook in de
// browser bruikbaar en los te testen.

import { CONTACT } from "@/lib/voorstel/schwarzwald";

const dag = (datum: string) => new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${datum}T12:00:00Z`));

/** "Buggy rijden bij Het Schwarzwald, zaterdag 7 november om 14:00" */
export const deelTekst = (activiteit: string, datum: string, tijd: string) => `${activiteit} bij ${CONTACT.naam}, ${dag(datum)} om ${tijd}`;

/** Routeplanner (Google Maps) naar het adres van Het Schwarzwald. */
export const routeUrl = () => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${CONTACT.naam}, ${CONTACT.adres}, ${CONTACT.postcode}`)}`;

/** Alleen de voornaam van de organisator, nooit meer. */
export const voornaam = (naam: string) => naam.trim().split(/\s+/)[0] ?? "";
