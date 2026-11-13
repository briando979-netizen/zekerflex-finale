// Wat over een ontvanger in een log of het foutenlogboek mag: alleen het domein, nooit het adres.
// Puur, zonder imports, zodat elke laag het kan gebruiken (lib/mail/index.ts, mailcode eromheen).

/** Het deel na de laatste @ in kleine letters, of "onbekend". "Naam <a@b.nl>" geeft "b.nl". */
function domeinVan(adres: unknown): string {
  const s = String(adres ?? "");
  const at = s.lastIndexOf("@");
  if (at < 0) return "onbekend";
  const domein = s.slice(at + 1).replace(/[>\s,;].*$/, "").toLowerCase();
  return domein || "onbekend";
}

/** Eén ontvanger of een lijst: de unieke domeinen, kommagescheiden. Stabiel per domein, dus geschikt als groepsleutel. */
export function ontvangerDomeinen(to: unknown): string {
  const lijst = Array.isArray(to) ? to : [to];
  return [...new Set(lijst.map(domeinVan))].join(", ");
}

/** Haalt e-mailadressen uit een tekst (bijv. een SMTP-antwoord "550 5.1.1 <naam@domein.nl> ..."). */
export function zonderAdressen(tekst: string | undefined): string {
  return (tekst ?? "").replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "<e-mail>");
}
