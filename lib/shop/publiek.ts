// Wat een bezoeker van een shopproduct te zien krijgt. De inkoopprijs en de
// interne verkopersvelden (status, notitie bij afwijzen, welk bedrijf) zijn
// alleen voor de beheerder; GET /api/shop/products is openbaar.

const INTERN = ["costCents", "sellerNote", "sellerStatus", "sellerTenantId"] as const;
type Intern = (typeof INTERN)[number];

export function publiekProduct<T extends Record<string, unknown>>(p: T): Omit<T, Intern> {
  const kopie: Record<string, unknown> = { ...p };
  for (const k of INTERN) delete kopie[k];
  return kopie as Omit<T, Intern>;
}
