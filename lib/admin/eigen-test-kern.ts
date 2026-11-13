// ---------------------------------------------------------------------------
// "Eigen test (telt niet mee)" (13 nov 2026, eigenaar via 86): bedrijven en accounts van de eigenaar zelf, alleen om te
// testen, zonder ze te hernoemen. Ze tellen niet mee in de trechters en de analyse (isTestAccount), en klussen van zo'n
// bedrijf gelden als testklus (isTestklus) — maar alleen klussen die zijn aangemaakt nadat het bedrijf gemarkeerd werd,
// zodat oude cijfers niet achteraf verschuiven. Puur: de set komt uit lib/admin/eigen-test.ts (KV systeem:eigen-test).
// ---------------------------------------------------------------------------

export interface EigenTest {
  /** tenant-id → sinds wanneer (ISO) */
  tenants: Record<string, string>;
  /** user-id → sinds wanneer (ISO) */
  users: Record<string, string>;
}

export const LEGE_EIGEN_TEST: EigenTest = { tenants: {}, users: {} };

/** Een account dat zelf, of via een van zijn bedrijven, als eigen test gemarkeerd is. */
export function isEigenTestAccount(et: EigenTest | null, ids: { userId?: string | null; tenantIds?: readonly string[] }): boolean {
  if (!et) return false;
  if (ids.userId && Object.hasOwn(et.users, ids.userId)) return true;
  return (ids.tenantIds ?? []).some((t) => Object.hasOwn(et.tenants, t));
}

/** Een klus van een eigen-testbedrijf, aangemaakt op of na het moment dat het bedrijf gemarkeerd werd. */
export function isEigenTestKlus(et: EigenTest | null, s: { tenantId: string | null | undefined; createdAt: Date | string | null | undefined }): boolean {
  if (!et || !s.tenantId || !s.createdAt || !Object.hasOwn(et.tenants, s.tenantId)) return false;
  const sinds = new Date(et.tenants[s.tenantId] ?? "").getTime();
  const gemaakt = new Date(s.createdAt).getTime();
  return Number.isFinite(sinds) && Number.isFinite(gemaakt) && gemaakt >= sinds;
}

/** De set na een schakeling: aan zet "sinds" op nu (een al gemarkeerde houdt zijn oude datum), uit haalt hem eruit. */
export function schakelEigenTest(et: EigenTest, soort: "tenant" | "user", id: string, aan: boolean, nu: Date): EigenTest {
  const veld = soort === "tenant" ? "tenants" : "users";
  const lijst = { ...et[veld] };
  if (aan) lijst[id] = lijst[id] ?? nu.toISOString();
  else delete lijst[id];
  return { ...et, [veld]: lijst };
}

/** Een set uit KV, schoon gemaakt: alleen tekst-id's met een geldige datum. */
export function leesEigenTestWaarde(v: unknown): EigenTest {
  const schoon = (x: unknown): Record<string, string> => {
    if (!x || typeof x !== "object" || Array.isArray(x)) return {};
    return Object.fromEntries(
      Object.entries(x as Record<string, unknown>).filter(([k, d]) => k.length > 0 && typeof d === "string" && Number.isFinite(new Date(d).getTime())),
    ) as Record<string, string>;
  };
  const o = (v && typeof v === "object" ? v : {}) as { tenants?: unknown; users?: unknown };
  return { tenants: schoon(o.tenants), users: schoon(o.users) };
}
