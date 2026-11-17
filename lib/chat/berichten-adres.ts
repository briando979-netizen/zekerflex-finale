// ---------------------------------------------------------------------------
// Het adres van de chatpagina in de omgeving waar iemand nu is (werker, werkgever of beheer), met wat de pagina
// meteen moet openen: ?met=<gebruiker> (met context en onderwerp), ?klus=<klus> (de werker bericht de opdrachtgever)
// of ?support=1. De chatpagina (components/chat/InboxPage.tsx) leest die één keer en haalt ze uit de adresbalk.
// Puur bestand: de knoppen (client) en de test gebruiken hetzelfde.
// ---------------------------------------------------------------------------

export interface BerichtenOpdracht {
  met?: string | undefined;
  context?: string | undefined;
  onderwerp?: string | undefined;
  klus?: string | undefined;
  support?: boolean | undefined;
}

/** De omgeving bij een pad: /werkgever/… en /admin/… hebben een eigen chatpagina, de rest is de werker-app. */
export function berichtenBasis(pathname: string | null | undefined): "/werkgever" | "/admin" | "/dashboard" {
  const p = pathname ?? "";
  if (p === "/werkgever" || p.startsWith("/werkgever/")) return "/werkgever";
  if (p === "/admin" || p.startsWith("/admin/")) return "/admin";
  return "/dashboard";
}

export function berichtenAdres(pathname: string | null | undefined, o: BerichtenOpdracht): string {
  const q = new URLSearchParams();
  if (o.support) q.set("support", "1");
  else if (o.klus) q.set("klus", o.klus);
  else if (o.met) {
    q.set("met", o.met);
    if (o.context) q.set("context", o.context.slice(0, 80));
    if (o.onderwerp) q.set("onderwerp", o.onderwerp.slice(0, 120));
  }
  const s = q.toString();
  return `${berichtenBasis(pathname)}/berichten${s ? `?${s}` : ""}`;
}
