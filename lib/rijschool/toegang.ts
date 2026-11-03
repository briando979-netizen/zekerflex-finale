import type { Rijschool } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { hasRole, requirePrincipal, type Principal } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { rijschoolVanSlug, rijschoolVanTenant } from "@/lib/rijschool/store";
import { isEigenaar } from "@/lib/rijschool/accounts";

// ---------------------------------------------------------------------------
// Wie het rijschool-pakket beheert: de beheerder (HQ_ADMIN) van het bedrijf,
// of een platformbeheerder voor zijn eigen bedrijf. Hetzelfde patroon als de
// websitebouwer (lib/sites/access.ts).
// ---------------------------------------------------------------------------

export async function rijschoolTenantVan(p: Principal): Promise<string> {
  const grant = p.grants.find((g) => g.role === "HQ_ADMIN");
  if (grant) return grant.organizationId;
  if (hasRole(p, "PLATFORM_ADMIN")) {
    const own = (await resolveEmployerScope(p)).tenantIds[0];
    if (own) return own;
  }
  throw AppError.forbidden("Alleen de beheerder van het bedrijf kan het rijschool-pakket beheren.");
}

export async function beheerContext(): Promise<{ p: Principal; tenantId: string; rijschool: Rijschool | null }> {
  const p = await requirePrincipal();
  const tenantId = await rijschoolTenantVan(p);
  return { p, tenantId, rijschool: await rijschoolVanTenant(tenantId) };
}

export async function eisBeheer(): Promise<{ p: Principal; tenantId: string; rijschool: Rijschool }> {
  const c = await beheerContext();
  if (!c.rijschool) throw AppError.precondition("Zet eerst het rijschool-pakket aan.");
  return { ...c, rijschool: c.rijschool };
}

/** De rijschool achter een adres, voor leerling- en instructeur-app (ook als de site nog niet publiek is). */
export async function siteRijschool(slug: string): Promise<Rijschool> {
  const r = await rijschoolVanSlug(slug);
  if (!r) throw AppError.notFound("Deze rijschool bestaat niet.");
  return r;
}

/** De publieke website: alleen als hij online staat, of voor de eigenaar die meekijkt. */
export async function publiekeRijschool(slug: string): Promise<Rijschool> {
  const r = await siteRijschool(slug);
  if (!r.online && !(await isEigenaar(r))) throw AppError.notFound("Deze rijschool bestaat niet.");
  return r;
}
