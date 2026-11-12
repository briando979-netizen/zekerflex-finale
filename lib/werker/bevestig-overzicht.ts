// ---------------------------------------------------------------------------
// De vraag vóór het insturen van de verificatie ("Weet je zeker dat je alles hebt ingevuld?"): het overzicht van wat de
// werker instuurt, als rijen label + waarde. Puur (geen React, geen fetch), zodat het te testen is. Het scherm
// (components/app/OnboardingForm.tsx) toont de rijen in een dialoog met "Terug" en "Ja, insturen".
// ---------------------------------------------------------------------------

export interface OverzichtLabels {
  naam: string;
  soort: string;
  nummer: string;
  geldigTot: string;
  kvk: string;
  btw: string;
  postcode: string;
  fotos: string;
  methode: string;
}

export interface OverzichtInvoer {
  /** "upload" = zelf foto's insturen, "stripe" = doorgaan naar Stripe Identity */
  methode: "stripe" | "upload";
  /** een veldwaarde uit het formulier (leeg als er niets staat) */
  veld: (naam: string) => string;
  labels: OverzichtLabels;
  /** de naam van het gekozen document (paspoort, ID-kaart, rijbewijs) */
  soortNaam: string;
  /** welk bedrijfsnummer er gevraagd wordt; null = geen */
  bedrijf: "kvk" | "vat" | null;
  /** de namen van de foto's die worden ingestuurd (alleen bij "upload") */
  fotoNamen: readonly string[];
  /** "Via Stripe …" */
  viaStripe: string;
}

export type OverzichtRij = readonly [label: string, waarde: string];

/** De rijen voor de bevestiging; een rij zonder waarde blijft weg, behalve de gegevens die verplicht zijn (dan staat er "—"). */
export function bevestigOverzicht(i: OverzichtInvoer): OverzichtRij[] {
  const rijen: OverzichtRij[] = [];
  const v = (n: string) => i.veld(n).trim();
  if (i.methode === "upload") {
    rijen.push([i.labels.naam, v("nameOnDocument") || "—"]);
    rijen.push([i.labels.soort, i.soortNaam]);
    rijen.push([i.labels.nummer, v("documentNumber") || "—"]);
    rijen.push([i.labels.geldigTot, v("documentExpiry") || "—"]);
    if (i.fotoNamen.length > 0) rijen.push([i.labels.fotos, i.fotoNamen.join(", ")]);
  } else {
    rijen.push([i.labels.methode, i.viaStripe]);
  }
  if (i.bedrijf) {
    const waarde = v(i.bedrijf === "kvk" ? "kvkNumber" : "vatNumber");
    if (waarde) rijen.push([i.bedrijf === "kvk" ? i.labels.kvk : i.labels.btw, waarde]);
  }
  const postcode = v("postalCode");
  if (postcode) rijen.push([i.labels.postcode, postcode]);
  return rijen;
}
