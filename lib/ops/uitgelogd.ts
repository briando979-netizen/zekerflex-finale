// ---------------------------------------------------------------------------
// Een pagina van een ingelogd deel die omvalt omdat de sessie net verliep (foutenlogboek
// 10 nov: GET /dashboard/verificatie "Je bent niet (meer) ingelogd", requirePrincipal in de
// pagina): de layout stuurt dan wel naar /login, maar pagina en layout worden tegelijk gebouwd
// en de fout van de pagina kan winnen. Het foutscherm (app/error.tsx) vraagt dan de sessie op
// en stuurt een uitgelogde bezoeker naar het inlogscherm, met terugkeer naar dezelfde pagina,
// in plaats van "Er ging iets mis". Puur bestand, ook in de browser.
// ---------------------------------------------------------------------------

/** De delen achter een inlog: hun layout stuurt zonder sessie naar /login. */
export const INGELOGDE_DELEN = ["/dashboard", "/werkgever", "/studio", "/sales", "/os", "/admin"] as const;

export function isIngelogdDeel(pad: string): boolean {
  return INGELOGDE_DELEN.some((d) => pad === d || pad.startsWith(`${d}/`));
}

/** /login met terugkeer naar dezelfde plek (alleen een pad op onze eigen site). */
export function inlogAdres(pad: string, zoek = ""): string {
  const terug = pad.startsWith("/") && !pad.startsWith("//") ? `${pad}${zoek.startsWith("?") ? zoek : ""}` : "/";
  return `/login?callbackUrl=${encodeURIComponent(terug)}`;
}

/** Het antwoord van /api/auth/session: null = niet ingelogd; een object = wel; iets anders = onbekend. */
export function sessieIsWeg(antwoord: unknown): boolean {
  return antwoord === null;
}
