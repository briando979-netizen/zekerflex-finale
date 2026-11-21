// ---------------------------------------------------------------------------
// De mail aan een uitzendpartner als een werker op zijn klus een uitzendcontract aanvraagt (21 nov 2026, zoals "Vraag
// uitzendcontract aan" bij YoungOnes). De werker gaf bij de knop toestemming om zijn contactgegevens met het bureau te
// delen; meer dan naam, e-mail en telefoon gaat er niet mee (geen BSN, geen ID-gegevens). Puur, zodat het te testen is.
// ---------------------------------------------------------------------------

export interface AanvraagGegevens {
  bureau: string;
  werker: { naam: string; email: string; telefoon: string | null };
  klus: { titel: string; wanneer: string };
  /** de klus in het werkgeversdashboard */
  link: string;
}

export function aanvraagMail(g: AanvraagGegevens): { subject: string; text: string } {
  const regels = [
    `Hallo ${g.bureau},`,
    "",
    `${g.werker.naam} vraagt een uitzendcontract bij jullie aan voor de klus "${g.klus.titel}" (${g.klus.wanneer}).`,
    "",
    "Contactgegevens (gedeeld met toestemming van de werker):",
    `- Naam: ${g.werker.naam}`,
    `- E-mail: ${g.werker.email}`,
    `- Telefoon: ${g.werker.telefoon?.trim() || "niet ingevuld"}`,
    "",
    "Jullie zijn bij deze klus de werkgever: neem contact op over het contract en de voorwaarden, en betaal het loon zelf.",
    "De reactie en de klus staan ook in jullie dashboard:",
    g.link,
    "",
    "Groet,",
    "ZekerFlex",
  ];
  return { subject: `Aanvraag uitzendcontract: ${g.werker.naam} voor ${g.klus.titel}`, text: regels.join("\n") };
}
