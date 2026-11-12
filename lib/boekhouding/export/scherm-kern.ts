// ---------------------------------------------------------------------------
// Export voor de accountant: formaten, bestandsnamen en teksten die route, scherm en tests delen (puur, zonder prisma
// of zod: ook de browser leest dit).
// ---------------------------------------------------------------------------

export const EXPORT_FORMATEN = ["xaf", "kolommenbalans-csv", "wv-csv", "kolommenbalans-html", "wv-html", "alles-zip", "controle"] as const;
export type ExportFormaat = (typeof EXPORT_FORMATEN)[number];

export const XAF_WAARSCHUWING =
  "Let op: de XAF-auditfile is gemaakt volgens onze beste kennis van XAF 3.2, maar de elementnamen en de volgorde zijn niet gecontroleerd tegen het officiële XSD. Laat het bestand door je accountant of met een XAF-validator (bijvoorbeeld die van de Belastingdienst of de SRA) testen voordat je erop vertrouwt.";

export const EXPORT_UITLEG =
  "Dit geeft je accountant alles wat nodig is: een auditfile (XAF) om in te lezen in zijn pakket, de kolommenbalans en de winst-en-verliesrekening als CSV (voor Excel) en als printbare pagina (die je als PDF kunt opslaan).";

export interface ExportKnopTekst {
  formaat: ExportFormaat;
  titel: string;
  uitleg: string;
}

export const EXPORT_KNOPPEN: readonly ExportKnopTekst[] = [
  { formaat: "xaf", titel: "Auditfile (XAF)", uitleg: "Alle rekeningen en boekingen van het boekjaar in het formaat dat boekhoudpakketten inlezen." },
  { formaat: "kolommenbalans-csv", titel: "Kolommenbalans (CSV)", uitleg: "Per rekening het openingssaldo, de boekingen en het eindsaldo. Opent in Excel." },
  { formaat: "wv-csv", titel: "Winst en verlies (CSV)", uitleg: "De opbrengsten, de kosten en het resultaat. Opent in Excel." },
  { formaat: "kolommenbalans-html", titel: "Kolommenbalans (afdrukken)", uitleg: "Een pagina om af te drukken of als PDF op te slaan." },
  { formaat: "wv-html", titel: "Winst en verlies (afdrukken)", uitleg: "Een pagina om af te drukken of als PDF op te slaan." },
  { formaat: "alles-zip", titel: "Alles in één zip", uitleg: "De auditfile en beide CSV-bestanden samen." },
];

/** De bestandsextensie en de Content-Type per formaat (controle is JSON en wordt niet gedownload). */
export const EXPORT_BESTAND: Readonly<Record<Exclude<ExportFormaat, "controle">, { ext: string; type: string; basis: string }>> = {
  xaf: { ext: "xaf", type: "application/xml; charset=utf-8", basis: "auditfile" },
  "kolommenbalans-csv": { ext: "csv", type: "text/csv; charset=utf-8", basis: "kolommenbalans" },
  "wv-csv": { ext: "csv", type: "text/csv; charset=utf-8", basis: "winst-en-verlies" },
  "kolommenbalans-html": { ext: "html", type: "text/html; charset=utf-8", basis: "kolommenbalans" },
  "wv-html": { ext: "html", type: "text/html; charset=utf-8", basis: "winst-en-verlies" },
  "alles-zip": { ext: "zip", type: "application/zip", basis: "boekhouding-voor-accountant" },
};

/**
 * Een bestandsnaam zonder persoonsgegevens en zonder naam van de administratie: alleen de soort, de periode en of het
 * een test is. Bv. "kolommenbalans-2026-01-01-2026-12-31.csv".
 */
export function exportBestandsnaam(formaat: Exclude<ExportFormaat, "controle">, van: string, tot: string, soort: "ECHT" | "TEST"): string {
  const b = EXPORT_BESTAND[formaat];
  return `${b.basis}-${van}-${tot}${soort === "TEST" ? "-test" : ""}.${b.ext}`;
}

/** De download-adressen voor het scherm. */
export function exportUrl(basis: string, formaat: ExportFormaat, administratieId: string, jaar: number): string {
  const q = new URLSearchParams({ administratieId, jaar: String(jaar), formaat });
  return `${basis}/export?${q.toString()}`;
}
