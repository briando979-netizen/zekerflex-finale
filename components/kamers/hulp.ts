/** De Nederlandse foutmelding uit een API-antwoord, of de standaardtekst. */
export async function leesFout(res: Response, standaard: string): Promise<string> {
  const d = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  return d?.error?.message ?? standaard;
}

export const euro = (cent: number): string => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(cent / 100);

/** 12500 → "125,00"; null → "". */
export const euroVeld = (c: number | null): string => (c === null ? "" : (c / 100).toFixed(2).replace(".", ","));

/** "125,50" → 12550 centen; leeg → null; onzin → NaN. */
export const centUitVeld = (s: string): number | null => {
  const t = s.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : Number.NaN;
};
