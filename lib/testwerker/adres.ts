// ---------------------------------------------------------------------------
// Het testwerkeraccount van de eigenaar (12 nov 2026, eigenaar: "maak een testwerkeraccount voor mij waar ik
// alles kan invullen en controleren, en dat elk uur zijn gegevens wist"). Het adres staat in de omgeving
// (TESTWERKER_EMAIL, geen .test: dan ziet hij de onboarding echt); elk uur zet lib/testwerker/reset.ts dat ene
// account terug naar "net aangemeld". Het telt niet mee in de cijfers en krijgt geen klusvoorstellen.
// Puur bestand: ook de matching en de cijfers lezen dit. Zonder omgevingswaarde is er geen testwerker.
// ---------------------------------------------------------------------------

/** Het adres van de testwerker, klein geschreven; null als het niet (goed) is ingesteld. */
export function testwerkerAdres(ruw: string | undefined = process.env.TESTWERKER_EMAIL): string | null {
  const adres = (ruw ?? "").trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adres) ? adres : null;
}

/** Is dit het testwerkeraccount? */
export function isTestwerker(email: string | null | undefined, ruw: string | undefined = process.env.TESTWERKER_EMAIL): boolean {
  const adres = testwerkerAdres(ruw);
  return Boolean(adres && email && email.trim().toLowerCase() === adres);
}

/**
 * Voor een `user: { … }`-filter in Prisma: zonder de testwerker. Zonder testwerker een leeg object.
 * Gebruik: `user: { disabledAt: null, ...zonderTestwerker() }`.
 */
export function zonderTestwerker(ruw: string | undefined = process.env.TESTWERKER_EMAIL): { NOT?: { email: { equals: string; mode: "insensitive" } } } {
  const adres = testwerkerAdres(ruw);
  return adres ? { NOT: { email: { equals: adres, mode: "insensitive" } } } : {};
}
