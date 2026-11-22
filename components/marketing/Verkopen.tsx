// Het genummerde rondje voor een stap, gebruikt door /leren. Dit bestand hoorde bij het Partnerplatform (/verkopen); die
// pagina's zijn op 22 nov 2026 weggehaald (geen flexwerk), alleen dit onderdeel is gebleven.

/** Een genummerd rondje voor een stap. */
export function StapNummer({ n }: { n: number }) {
  return (
    <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink font-display text-sm font-bold text-white">
      {n}
    </span>
  );
}
