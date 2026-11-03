// ---------------------------------------------------------------------------
// Een tabblad dat nog openstond van vóór een uitrol vraagt soms een
// server-actie of code-chunk op die de nieuwe build niet meer kent. Eén keer
// hard herladen haalt de nieuwe versie op (app/error.tsx doet dat zelf), dus
// het is geen echte fout: /api/client-error logt het als waarschuwing, zodat de
// eigenaar niet na elke uitrol een "nieuwe soort fout"-melding krijgt.
// Puur (geen imports): de foutgrens in de browser gebruikt het ook.
// ---------------------------------------------------------------------------

// Next 15 gooit voor een onbekende actie een UnrecognizedActionError met
// 'Server Action "<id>" was not found on the server'; Next 14 zei "Failed to find Server Action".
const STALE_DEPLOYMENT =
  /Failed to find Server Action|Server Action "[^"]*" was not found on the server|UnrecognizedActionError|ChunkLoadError|Loading (CSS )?chunk|from an older or newer deployment/i;

export function isStaleDeployment(error: { message?: string | undefined; name?: string | undefined } | null | undefined): boolean {
  return STALE_DEPLOYMENT.test(`${error?.name ?? ""} ${error?.message ?? ""}`);
}
