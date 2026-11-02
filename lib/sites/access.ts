import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { hasRole, type Principal } from "@/lib/auth";
import { adminFullAccess } from "@/lib/auth/admin-access";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { getManagedWebsite, isUnlocked } from "@/lib/website/manage";
import type { Company } from "@/lib/sites/types";

// ---------------------------------------------------------------------------
// Who may build a company's website, and who may put it online. Building and
// previewing is open to the company admin (try before you buy); publishing
// needs the Website-beheer subscription — or a platform admin, who may use
// every paid feature (lib/auth/admin-access).
// ---------------------------------------------------------------------------

/** The company whose website this person edits (HQ admin, or a platform admin's own company). */
export async function siteTenantOf(p: Principal): Promise<string> {
  const grant = p.grants.find((g) => g.role === "HQ_ADMIN");
  if (grant) return grant.organizationId;
  if (hasRole(p, "PLATFORM_ADMIN")) {
    const scope = await resolveEmployerScope(p);
    const own = scope.tenantIds[0];
    if (own) return own;
  }
  throw AppError.forbidden("Alleen de beheerder van een bedrijf kan de website bouwen.");
}

export async function mayPublish(p: Principal, tenantId: string): Promise<boolean> {
  return adminFullAccess(p) || isUnlocked(await getManagedWebsite(tenantId));
}

/** What we already know about the company, to fill in the first step. */
export async function companyDefaults(tenantId: string, p: Principal): Promise<Company> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      name: true,
      kvkNumber: true,
      companyRegistration: { select: { kvkNumber: true, tradeName: true, street: true, houseNumber: true, postalCode: true, city: true } },
      branches: { select: { addressLine: true, postalCode: true, city: true }, take: 1, orderBy: { createdAt: "asc" } },
    },
  });
  const reg = tenant?.companyRegistration;
  const branch = tenant?.branches[0];
  return {
    naam: reg?.tradeName || tenant?.name || "",
    kvk: (reg?.kvkNumber ?? tenant?.kvkNumber ?? "").replace(/\D/g, "").slice(0, 8),
    straat: reg?.street ? [reg.street, reg.houseNumber].filter(Boolean).join(" ") : (branch?.addressLine ?? ""),
    postcode: reg?.postalCode ?? branch?.postalCode ?? "",
    plaats: reg?.city ?? branch?.city ?? "",
    telefoon: "",
    email: p.email,
  };
}
