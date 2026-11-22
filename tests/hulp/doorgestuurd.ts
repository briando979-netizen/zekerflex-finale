import path from "node:path";
import { pathToFileURL } from "node:url";

// De oude pagina's die weg zijn en via de omleidingen in next.config.mjs doorsturen (22 nov 2026: de verkooppagina's en
// hulpmiddelen die niet over flexwerk gaan). Een link naar zo'n pad is geen dode link: de bezoeker komt op de nieuwe plek.
// Alleen vaste bronnen tellen (zonder :param), zodat een link naar een willekeurig subpad niet stil goedgekeurd wordt.

type Regel = { source: string; destination: string };

export async function doorgestuurdePaden(): Promise<Set<string>> {
  const mod = (await import(pathToFileURL(path.join(process.cwd(), "next.config.mjs")).href)) as { default: { redirects: () => Promise<Regel[]> } };
  return new Set((await mod.default.redirects()).map((r) => r.source).filter((s) => !s.includes(":")));
}

/** Het pad van een link, zonder query en anker. */
export const padVan = (href: string): string => (href.split(/[?#]/)[0] ?? href).replace(/\/$/, "") || "/";
