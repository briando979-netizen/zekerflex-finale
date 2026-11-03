import type { HorecaZaak } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { getPrincipal, hasRole, requirePrincipal, type Principal } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { zaakVanSlug, zaakVanTenant } from "@/lib/horeca/store";

// ---------------------------------------------------------------------------
// Wie het horeca-pakket beheert: de beheerder (HQ_ADMIN) van het bedrijf, of
// een platformbeheerder voor zijn eigen bedrijf. Hetzelfde patroon als het
// rijschool-pakket (lib/rijschool/toegang.ts).
// ---------------------------------------------------------------------------

export async function horecaTenantVan(p: Principal): Promise<string> {
  const grant = p.grants.find((g) => g.role === "HQ_ADMIN");
  if (grant) return grant.organizationId;
  if (hasRole(p, "PLATFORM_ADMIN")) {
    const own = (await resolveEmployerScope(p)).tenantIds[0];
    if (own) return own;
  }
  throw AppError.forbidden("Alleen de beheerder van het bedrijf kan het horeca-pakket beheren.");
}

export async function beheerContext(): Promise<{ p: Principal; tenantId: string; zaak: HorecaZaak | null }> {
  const p = await requirePrincipal();
  const tenantId = await horecaTenantVan(p);
  return { p, tenantId, zaak: await zaakVanTenant(tenantId) };
}

export async function eisBeheer(): Promise<{ p: Principal; tenantId: string; zaak: HorecaZaak }> {
  const c = await beheerContext();
  if (!c.zaak) throw AppError.precondition("Zet eerst het horeca-pakket aan.");
  return { ...c, zaak: c.zaak };
}

/** Is de bezoeker de eigenaar (of platformbeheerder) van deze zaak? */
export async function isEigenaar(z: Pick<HorecaZaak, "tenantId">): Promise<boolean> {
  const p = await getPrincipal().catch(() => null);
  if (!p) return false;
  return p.grants.some((g) => g.role === "HQ_ADMIN" && g.organizationId === z.tenantId) || hasRole(p, "PLATFORM_ADMIN");
}

/** De publieke site: alleen als hij online staat, of voor de eigenaar die meekijkt. */
export async function publiekeZaak(slug: string): Promise<HorecaZaak> {
  const z = await zaakVanSlug(slug);
  if (!z || (!z.online && !(await isEigenaar(z)))) throw AppError.notFound("Deze zaak bestaat niet.");
  return z;
}
