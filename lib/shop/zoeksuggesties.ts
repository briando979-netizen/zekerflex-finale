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

/** Bewerkingsafstand (Levenshtein) tussen twee woorden, met een plafond: boven `max` maakt het niet uit hoeveel. */
export function afstand(a: string, b: string, max = 3): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let vorige = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const rij = [i];
    let kleinste = i;
    for (let j = 1; j <= b.length; j++) {
      const w = Math.min((vorige[j] ?? 0) + 1, (rij[j - 1] ?? 0) + 1, (vorige[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1));
      rij.push(w);
      if (w < kleinste) kleinste = w;
    }
    if (kleinste > max) return max + 1;
    vorige = rij;
  }
  return vorige[b.length] ?? max + 1;
}

/**
 * "Bedoelde je …?" zoals bol.com (stap 4, 15 nov 2026): een tikfout verbeterd met de woorden die echt in de catalogus staan
 * (naam en categorie). Alleen als de verbeterde vraag wél iets vindt; korte woorden mogen één letter verschillen, langere
 * twee. Geen verbetering nodig of mogelijk: null.
 */
export function bedoeldeJe(producten: readonly ZoekProduct[], vraag: string): string | null {
  const q = normaliseer(vraag);
  if (q.length < 3 || producten.some((p) => zoekScore(p, q) > 0)) return null;
  const woorden = new Set<string>();
  for (const p of producten) for (const w of normaliseer(`${p.name} ${p.category ?? ""}`).split(/[^a-z0-9]+/)) if (w.length >= 3) woorden.add(w);
  let veranderd = false;
  const nieuw = q.split(" ").map((w) => {
    if (w.length < 3 || [...woorden].some((x) => x.includes(w))) return w;
    const max = w.length <= 5 ? 1 : 2;
    let beste: { woord: string; d: number } | null = null;
    for (const kandidaat of woorden) {
      const d = afstand(w, kandidaat, max);
      if (d <= max && (!beste || d < beste.d || (d === beste.d && kandidaat < beste.woord))) beste = { woord: kandidaat, d };
    }
    if (!beste) return w;
    veranderd = true;
    return beste.woord;
  });
  if (!veranderd) return null;
  const voorstel = nieuw.join(" ");
  return producten.some((p) => zoekScore(p, voorstel) > 0) ? voorstel : null;
}
