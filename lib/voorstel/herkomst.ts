// ---------------------------------------------------------------------------
// Komt een wijzigend verzoek van onze eigen site? De browser stuurt bij een
// POST de Origin mee; die moet gelijk zijn aan de host waarop de bezoeker zit.
// Achter Caddy is request.url de interne host (app:3000), dus de echte host
// komt uit X-Forwarded-Host of Host. Een andere website kan die koppen in de
// browser van een bezoeker niet zetten, de Origin wel niet vervalsen.
// ---------------------------------------------------------------------------

export function zelfdeHerkomst(headers: Headers, url: string): boolean {
  const origin = headers.get("origin");
  // geen Origin: geen browser-post van een andere site (bv. curl, server)
  if (!origin) return true;
  let herkomst: string;
  try {
    herkomst = new URL(origin).host.toLowerCase();
  } catch {
    return false;
  }
  const hosts = [headers.get("x-forwarded-host")?.split(",")[0], headers.get("host"), new URL(url).host]
    .filter((h): h is string => !!h)
    .map((h) => h.trim().toLowerCase());
  return hosts.includes(herkomst);
}
