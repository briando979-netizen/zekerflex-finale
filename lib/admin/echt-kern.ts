import { isTestAccount } from "@/lib/admin/onboarding-model";
import type { EigenTest } from "@/lib/admin/eigen-test-kern";

// ---------------------------------------------------------------------------
// Wat telt als echt (15 nov 2026): één regel voor de werkgeverstrechter (lib/admin/werkgever-trechter.ts), de
// weekcijfers (lib/admin/weekcijfers.ts) en de cockpit. Puur. De eigen testbedrijven ("Test bedrijven", het
// rondgangbedrijf) en de accounts van ZekerFlex zelf blazen de cijfers anders op: op 15 nov stonden er 98 open
// klussen, alle 98 van het eigen testbedrijf.
// ---------------------------------------------------------------------------

export interface LidFeiten {
  id: string;
  email: string;
  disabledAt: Date | null;
  rollen: string[];
}

/** Echt bedrijf: geen eigen test, en minstens één lid dat geen testaccount is (testadressen, eigen domein, beheer en sales, "Test …"). */
export function isEchtBedrijf(t: { id: string; name: string; leden: readonly LidFeiten[] }, eigenTest: EigenTest | null): boolean {
  if (eigenTest && Object.hasOwn(eigenTest.tenants, t.id)) return false;
  return t.leden.some(
    (l) =>
      !isTestAccount({
        email: l.email,
        rollen: l.rollen,
        disabledAt: l.disabledAt,
        tenantNamen: [t.name],
        eigenTest: Boolean(eigenTest && Object.hasOwn(eigenTest.users, l.id)),
      }),
  );
}

/** Een echte aanmelding: geen testaccount, geen intern account (usr_zf_…), niet als eigen test gemarkeerd (zelf of via een bedrijf). */
export function isEchteAanmelding(
  u: { id: string; email: string; disabledAt: Date | null; rollen: string[]; tenantIds: readonly string[]; tenantNamen: string[] },
  eigenTest: EigenTest | null,
): boolean {
  if (u.id.startsWith("usr_zf_")) return false;
  const eigen = Boolean(eigenTest && (Object.hasOwn(eigenTest.users, u.id) || u.tenantIds.some((t) => Object.hasOwn(eigenTest.tenants, t))));
  return !isTestAccount({ email: u.email, rollen: u.rollen, disabledAt: u.disabledAt, tenantNamen: u.tenantNamen, eigenTest: eigen });
}
