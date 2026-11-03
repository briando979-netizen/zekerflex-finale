import { ACTIVITEITEN, THEMAFEESTEN } from "@/lib/voorstel/schwarzwald";

// Regels voor nieuwsberichten. Puur, los te testen (ook in de browser).

/** "Nieuwe kever-rally: 3 routes & meer!" -> "nieuwe-kever-rally-3-routes-meer" */
export function maakSlug(titel: string): string {
  const s = titel
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " en ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70)
    .replace(/-+$/, "");
  return s || "bericht";
}

/** Uniek binnen de bestaande slugs: "x", "x-2", "x-3", … */
export function uniekeSlug(basis: string, bestaand: Iterable<string>): string {
  const bezet = new Set(bestaand);
  if (!bezet.has(basis)) return basis;
  let n = 2;
  while (bezet.has(`${basis}-${n}`)) n++;
  return `${basis}-${n}`;
}

/** Tekst met lege regels ertussen -> alinea's (geen HTML, React escapet). */
export const alineas = (tekst: string) =>
  tekst
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((a) => a.trim())
    .filter(Boolean);

/** Foto's die een bericht mag gebruiken: hun eigen activiteit- en themafoto's. */
export const NIEUWS_FOTOS: { pad: string; naam: string }[] = [...ACTIVITEITEN, ...THEMAFEESTEN]
  .filter((x): x is typeof x & { foto: string } => !!x.foto)
  .map((x) => ({ pad: x.foto, naam: x.naam }))
  .filter((x, i, alle) => alle.findIndex((y) => y.pad === x.pad) === i);

/** Zichtbaar op de site: gepubliceerd en de datum is bereikt (later datum = ingepland). */
export const zichtbaar = (b: { gepubliceerd: boolean; datum: string }, vandaag: string) => b.gepubliceerd && b.datum <= vandaag;
