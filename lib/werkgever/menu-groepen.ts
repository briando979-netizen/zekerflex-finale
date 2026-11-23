// ---------------------------------------------------------------------------
// De twee groepen van de zijbalk in de werkgeversapp (23 nov 2026, ronde 2 van de ombouw naar de opzet van het
// YoungOnes-dashboard). Daar staan vijf hoofdregels: Jouw start, Klussen, Kalender, Mijn workers en Instellingen. Bij ons
// komen de eerste vier uit het menu (menuVoor, lib/werkgever/werkruimte.ts) en staat Instellingen er vast achter; al het
// andere (Chat, Uren, Facturen, Cijfers, Regels, Hulpcentrum, het blok Uitzendbureau) komt in een rustiger tweede groep.
// Dit verandert alleen de weergave: welke regels er zijn en in welke volgorde bepaalt nog altijd menuVoor() plus de
// volgorde uit de Site-ontwerper. Puur bestand (geen React), zodat de schil (client) en een test het delen.
// ---------------------------------------------------------------------------

/** De adressen van de hoofdregels. Planning en Kalender delen een adres, net als Mijn werkers en Favorieten. */
export const HOOFD_ADRESSEN: readonly string[] = ["/werkgever", "/werkgever/diensten", "/werkgever/kalender", "/werkgever/favorieten"];

/** Het menu in tweeën: de hoofdregels en de rest, elk in de volgorde waarin ze binnenkwamen. Er valt niets weg. */
export function splitsMenu<T extends { href: string }>(nav: readonly T[]): { hoofd: T[]; rest: T[] } {
  const hoofd: T[] = [];
  const rest: T[] = [];
  for (const item of nav) (HOOFD_ADRESSEN.includes(item.href) ? hoofd : rest).push(item);
  return { hoofd, rest };
}

/** Opeenvolgende regels met dezelfde sectienaam bij elkaar (voor het kopje boven een blok). */
export function perSectie<T extends { section?: string | undefined }>(items: readonly T[]): { section: string | null; items: T[] }[] {
  const groepen: { section: string | null; items: T[] }[] = [];
  for (const item of items) {
    const naam = item.section ?? null;
    const laatste = groepen[groepen.length - 1];
    if (laatste && laatste.section === naam) laatste.items.push(item);
    else groepen.push({ section: naam, items: [item] });
  }
  return groepen;
}
