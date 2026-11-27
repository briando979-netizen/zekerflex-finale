// ---------------------------------------------------------------------------
// "Liever zonder account? Wij zetten je klus voor je online" op /klus-plaatsen (27 nov 2026, eigenaar: "laten we de bedrijven de
// drempel weghalen"). Meting van 27 nov: ±38 echte bezoekers openden het klusformulier, 2 verstuurden het, en niemand drukte op de
// knop met een leeg veld; ze haakten dus af vóór de knop "Plaats deze klus met een gratis account". Hier laat een bedrijf alleen
// zijn naam en een telefoonnummer of e-mailadres achter bij de klus die het samenstelde; ZekerFlex neemt contact op en zet de klus
// samen online. Er komt niets online zonder account en KVK-controle: dit is een verkoopaanvraag (Beheer → Sales), geen klus.
// Puur: het formulier (browser), de route (server) en de tests delen dit bestand.
// ---------------------------------------------------------------------------

export const AANVRAAG_MAX = { naam: 80, bedrijf: 160, telefoon: 40, email: 200, functie: 120, plaats: 80, omschrijving: 1000 } as const;

export interface AanvraagContact {
  naam: string;
  bedrijf: string;
  telefoon: string;
  email: string;
}

export interface AanvraagKlus {
  functie: string;
  plaats: string;
  /** YYYY-MM-DD */
  datum: string;
  /** HH:MM */
  van: string;
  tot: string;
  aantal: number;
  tariefCents: number;
  omschrijving?: string | undefined;
}

export type AanvraagVeld = "naam" | "bedrijf" | "contact";

/** Een Nederlands of buitenlands nummer: 9 tot 15 cijfers (spaties, streepjes en + mogen erin). */
export const telefoonGeldig = (t: string): boolean => {
  const cijfers = t.replace(/\D/g, "");
  return /^[\d\s()+.-]*$/.test(t.trim()) && cijfers.length >= 9 && cijfers.length <= 15;
};

export const emailGeldig = (e: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim()) && e.trim().length <= AANVRAAG_MAX.email;

/** Wat er nog ontbreekt (de eerste), of null als de aanvraag verstuurd kan worden. Telefoon óf e-mail is genoeg. */
export function aanvraagOntbreekt(c: AanvraagContact): { veld: AanvraagVeld; tekst: string } | null {
  if (c.naam.trim().length < 2) return { veld: "naam", tekst: "Vul je naam in." };
  if (c.bedrijf.trim().length < 2) return { veld: "bedrijf", tekst: "Vul de naam van je bedrijf in." };
  const tel = c.telefoon.trim();
  const mail = c.email.trim();
  if (!tel && !mail) return { veld: "contact", tekst: "Vul je telefoonnummer of e-mailadres in, dan kunnen we je bereiken." };
  if (tel && !telefoonGeldig(tel)) return { veld: "contact", tekst: "Dit telefoonnummer klopt niet. Controleer het, of vul je e-mailadres in." };
  if (mail && !emailGeldig(mail)) return { veld: "contact", tekst: "Dit e-mailadres klopt niet. Controleer het, of vul je telefoonnummer in." };
  return null;
}

const euro = (cents: number): string => `€ ${(Math.round(cents) / 100).toFixed(2).replace(".", ",")}`;

function datumNl(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" });
}

/** De klus in een paar regels, voor de mail aan ZekerFlex en de notitie bij de verkoopaanvraag. Lege onderdelen vallen weg. */
export function aanvraagSamenvatting(k: AanvraagKlus): string[] {
  const regels: string[] = [];
  if (k.functie.trim()) regels.push(`Functie: ${k.functie.trim()}`);
  if (k.plaats.trim()) regels.push(`Plaats: ${k.plaats.trim()}`);
  if (k.datum) regels.push(`Wanneer: ${datumNl(k.datum)}${k.van && k.tot ? `, ${k.van}–${k.tot}` : ""}`);
  if (k.aantal > 0) regels.push(`Aantal mensen: ${k.aantal}`);
  if (k.tariefCents > 0) regels.push(`Uurtarief: ${euro(k.tariefCents)}`);
  if (k.omschrijving?.trim()) regels.push(`Omschrijving: ${k.omschrijving.trim()}`);
  return regels;
}
