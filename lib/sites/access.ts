import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { hasRole, type Principal } from "@/lib/auth";
import { freeAccess } from "@/lib/billing/comp";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { getManagedWebsite, isUnlocked } from "@/lib/website/manage";
import type { Company, SiteSoort } from "@/lib/sites/types";

// ---------------------------------------------------------------------------
// Who may build a company's website, and who may put it online. Building and
// previewing is open to the company admin (try before you buy); publishing
// needs the Website-beheer subscription — or a platform admin or free (comp)
// account, who may use every paid feature (lib/billing/comp).
// ---------------------------------------------------------------------------

/** Website of webshop: de studio vraagt met `?soort=webshop`; zonder is het de website (zo werken oude aanroepen door). */
export const soortVan = (request: Request): SiteSoort => (new URL(request.url).searchParams.get("soort") === "webshop" ? "webshop" : "website");

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
  return (await freeAccess(p)) || isUnlocked(await getManagedWebsite(tenantId));
}

/**
 * Het vrije adres van een rijschool of horecazaak ("Dorpsstraat 1a, 1234 AB Utrecht") in de velden
 * van een site. Zonder postcode is het deel tot de eerste komma de straat; niets wordt verzonnen.
 */
function splitsAdres(adres: string): { straat: string; postcode: string; plaats: string } {
  const tekst = adres.trim();
  const pc = /\b(\d{4})\s?([A-Za-z]{2})\b/.exec(tekst);
  if (!pc) return { straat: (tekst.split(",")[0] ?? "").trim(), postcode: "", plaats: "" };
  const schoon = (s: string) => s.replace(/^[\s,]+|[\s,]+$/g, "");
  return {
    straat: schoon(tekst.slice(0, pc.index)),
    postcode: `${pc[1] ?? ""} ${(pc[2] ?? "").toUpperCase()}`,
    plaats: schoon(tekst.slice(pc.index + pc[0].length)),
  };
}

/**
 * What we already know about the company, to fill in the first step: the registration and the first
 * branch, the phone of whoever starts it, and as a last resort what the company already entered for
 * its driving school or restaurant (another dashboard, lib/werkgever/werkruimte.ts). Only empty fields
 * are filled from there.
 */
export async function companyDefaults(tenantId: string, p: Principal): Promise<Company> {
  const pakketVelden = { kvk: true, adres: true, plaats: true, telefoon: true } as const;
  const [tenant, user, rijschool, horeca] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        name: true,
        kvkNumber: true,
        companyRegistration: { select: { kvkNumber: true, tradeName: true, street: true, houseNumber: true, postalCode: true, city: true } },
        branches: { select: { addressLine: true, postalCode: true, city: true }, take: 1, orderBy: { createdAt: "asc" } },
      },
    }),
    prisma.user.findUnique({
      where: { id: p.userId },
      select: { phone: true },
    }),
    // los en foutbestendig: zonder rijschool of zaak (of bij een storing) blijft het bij het bovenstaande
    prisma.rijschool.findUnique({ where: { tenantId }, select: pakketVelden }).catch(() => null),
    prisma.horecaZaak.findUnique({ where: { tenantId }, select: pakketVelden }).catch(() => null),
  ]);
  const reg = tenant?.companyRegistration;
  const branch = tenant?.branches[0];
  const pakket = (veld: "kvk" | "plaats" | "telefoon") => rijschool?.[veld]?.trim() || horeca?.[veld]?.trim() || "";
  const pakketAdres = splitsAdres(rijschool?.adres || horeca?.adres || "");
  return {
    naam: reg?.tradeName || tenant?.name || "",
    kvk: (reg?.kvkNumber || tenant?.kvkNumber || pakket("kvk")).replace(/\D/g, "").slice(0, 8),
    straat: (reg?.street ? [reg.street, reg.houseNumber].filter(Boolean).join(" ") : "") || branch?.addressLine || pakketAdres.straat,
    postcode: reg?.postalCode || branch?.postalCode || pakketAdres.postcode,
    plaats: reg?.city || branch?.city || pakket("plaats") || pakketAdres.plaats,
    telefoon: user?.phone || pakket("telefoon"),
    email: p.email,
  };
}
