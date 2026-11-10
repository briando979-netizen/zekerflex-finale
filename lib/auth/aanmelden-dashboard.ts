// ---------------------------------------------------------------------------
// Aanmelden voor één dashboard (10 nov 2026, eigenaar: "een aparte aanmelding per product").
// /register?type=bedrijf&dashboard=<soort> toont een eigen kop en kiest dat dashboard al voor;
// het bedrijf opent na de bevestigingsmail meteen daarin (lib/werkgever/werkruimte.ts thuisVan).
// De productpagina's zijn alleen Nederlands, dus deze teksten ook. Puur: de pagina (server) en het
// formulier (client) lezen allebei uit dit bestand.
// ---------------------------------------------------------------------------
import { isWerkruimte, type Werkruimte } from "@/lib/werkgever/werkruimte";

export const AANMELDEN_PER_DASHBOARD: Record<Werkruimte, { titel: string; uitleg: string }> = {
  personeel: {
    titel: "Personeel inhuren",
    uitleg: "Maak je account aan; daarna plaats je je eerste klus en krijg je passende flexwerkers voorgesteld.",
  },
  rijschool: {
    titel: "Start je rijschool",
    uitleg: "Maak je account aan; daarna richt je je rijschool in met een website, lesagenda en de apps voor leerlingen en instructeurs.",
  },
  horeca: {
    titel: "Start met je zaak",
    uitleg: "Maak je account aan; daarna zet je je zaak aan met een eigen website en menukaart, en kies je de modules die je nodig hebt.",
  },
  website: {
    titel: "Start je website",
    uitleg: "Maak je account aan; daarna kies je een ontwerp voor je branche en pas je teksten en foto's aan.",
  },
  webshop: {
    titel: "Start je webshop",
    uitleg: "Maak je account aan; daarna kies je een ontwerp en zet je je eerste product online.",
  },
};

/** `?dashboard=` van /register: alleen een bekend dashboard telt, de rest negeren we. */
export function dashboardUitParam(waarde: unknown): Werkruimte | undefined {
  return isWerkruimte(waarde) ? waarde : undefined;
}

/** Het adres om je als bedrijf aan te melden voor dit dashboard. */
export function aanmeldAdres(soort: Werkruimte): string {
  return `/register?type=bedrijf&dashboard=${soort}`;
}
