import { redirect } from "next/navigation";
import { getPrincipal, hasRole, type Principal } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { werkruimteVan } from "@/lib/werkgever/werkruimte-server";
import { studioAccountAdres, type AccountOnderdeel } from "@/lib/studio/account";

/** Naam en e-mail voor de accountknop in de studio; null zonder sessie. */
export async function studioGebruiker(): Promise<{ naam: string; email: string } | null> {
  const principal = await getPrincipal().catch(() => null);
  return principal ? { naam: principal.fullName, email: principal.email } : null;
}

/**
 * Heeft deze browser het dashboard website of webshop open, dan hoort een accountscherm van
 * /werkgever in de studio: daarheen sturen (een link uit een mail, een oude bladwijzer). De studio
 * eist HQ_ADMIN of PLATFORM_ADMIN (app/studio/layout.tsx); een collega zonder die rol blijft hier.
 */
export async function naarStudioAccount(principal: Principal, onderdeel: AccountOnderdeel): Promise<void> {
  if (!hasRole(principal, "HQ_ADMIN", "PLATFORM_ADMIN")) return;
  let soort: string | null = null;
  try {
    const scope = await resolveEmployerScope(principal);
    soort = (await werkruimteVan(scope.tenantIds[0])).soort;
  } catch {
    return; // geen bedrijf of een storing: de gewone pagina
  }
  // redirect() buiten de try: hij werkt door een uitzondering te gooien
  if (soort === "website" || soort === "webshop") redirect(studioAccountAdres(soort, onderdeel));
}
