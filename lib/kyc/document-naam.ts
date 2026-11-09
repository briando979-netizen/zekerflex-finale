// ---------------------------------------------------------------------------
// Hoort de naam op het document (MRZ of chip) bij dit account? (review 06, M3)
// Een losse gelijkenis (nameSimilarity ≥ 0,5) liet "Jan Jansen" ≈ "Piet Jansen"
// door. De regel hier: de achternaam van het document staat exact in de
// accountnaam (tussenvoegsels tellen niet, aaneen geschreven mag), én de eerste
// voornaam van het document staat erin. Een roepnaam die anders is dan de
// officiële eerste voornaam past dus niet: dan kijkt een mens. Hoofdletters en
// accenten maken niet uit. Puur: tests/kyc-document-naam.test.ts.
// ---------------------------------------------------------------------------

const TUSSENVOEGSELS = new Set([
  "van", "de", "der", "den", "het", "ten", "ter", "te", "op", "in", "vd",
  "la", "le", "du", "da", "di", "del", "della", "dos", "das", "von", "vom", "zu", "el", "al",
]);

function woorden(s: string): string[] {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
}

export interface DocumentNaam {
  achternaam: string;
  voornamen: string;
}

export function documentNaamPast(accountNaam: string, doc: DocumentNaam): boolean {
  const account = woorden(accountNaam);
  const accountZonder = account.filter((w) => !TUSSENVOEGSELS.has(w));
  const achter = woorden(doc.achternaam).filter((w) => !TUSSENVOEGSELS.has(w));
  const eersteVoornaam = woorden(doc.voornamen)[0];
  if (achter.length === 0 || !eersteVoornaam || account.length === 0) return false;
  const achternaamPast = achter.every((w) => accountZonder.includes(w)) || accountZonder.join("").includes(achter.join(""));
  return achternaamPast && account.includes(eersteVoornaam);
}
