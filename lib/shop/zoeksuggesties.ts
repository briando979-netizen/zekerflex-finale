// ---------------------------------------------------------------------------
// Zoeksuggesties in de webshop (15 nov 2026, eigenaar: "de webshop moet eruitzien en werken als bol.com"). Terwijl je typt:
// de best passende producten en categorieën. Puur, ook voor de browser: de lijst producten heeft de shop al
// (components/marketing/ShopChrome.tsx), er gaat geen extra verzoek naar de server.
// ---------------------------------------------------------------------------

export interface ZoekProduct {
  name: string;
  category?: string | null;
  description?: string | null;
}

/** Kleine letters, zonder accenten en dubbele spaties: "Café" vindt "cafe". */
export function normaliseer(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Hoe goed een product past: 0 = niet. Elk woord van de zoekvraag moet ergens voorkomen. */
export function zoekScore(p: ZoekProduct, vraag: string): number {
  const q = normaliseer(vraag);
  if (q.length < 2) return 0;
  const naam = normaliseer(p.name);
  const rest = normaliseer(`${p.category ?? ""} ${p.description ?? ""}`);
  const woorden = q.split(" ").filter(Boolean);
  if (!woorden.every((w) => naam.includes(w) || rest.includes(w))) return 0;
  if (naam.startsWith(q)) return 4;
  if (naam.split(" ").some((w) => w.startsWith(woorden[0] ?? q))) return 3;
  if (woorden.every((w) => naam.includes(w))) return 2;
  return 1;
}

/** De beste producten voor de zoekvraag, hooguit `max`; gelijke score op naam. */
export function zoekSuggesties<T extends ZoekProduct>(producten: readonly T[], vraag: string, max = 6): T[] {
  return producten
    .map((p) => ({ p, s: zoekScore(p, vraag) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.p.name.localeCompare(b.p.name, "nl"))
    .slice(0, max)
    .map((x) => x.p);
}

/** De categorieën waarvan de naam bij de zoekvraag past (bijv. "werk" → "Werk & PBM"). */
export function categorieTreffers(categorieen: readonly { waarde: string; label: string }[], vraag: string): { waarde: string; label: string }[] {
  const q = normaliseer(vraag);
  if (q.length < 2) return [];
  return categorieen.filter((c) => normaliseer(c.label).includes(q) || normaliseer(c.waarde).includes(q));
}
