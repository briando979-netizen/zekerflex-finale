import { hasRole, type Principal } from "@/lib/auth";
import type { OsRol } from "@/lib/os/apps";

// ---------------------------------------------------------------------------
// Welke OS-rol hoort bij iemand die inlogt. Dezelfde grenzen als de portalen
// zelf: /werkgever is voor managers en beheerders, /dashboard voor werkers.
// Het OS toont nooit een app die achter zo'n grens zit — en elke app blijft
// bovendien zijn eigen controle doen, want het OS is maar een schil.
// ---------------------------------------------------------------------------

export function osRolVan(principal: Principal): OsRol {
  if (hasRole(principal, "PLATFORM_ADMIN")) return "admin";
  if (hasRole(principal, "LOCAL_MANAGER", "HQ_ADMIN", "DISPUTE_MANAGER")) return "werkgever";
  return "werker";
}

/** De naam waarmee het OS je begroet: de voornaam, anders het begin van het e-mailadres. */
export function osNaam(principal: Principal): string {
  const naam = principal.fullName.trim();
  if (naam) return naam.split(/\s+/)[0] ?? naam;
  const mail = principal.email.trim();
  return mail ? (mail.split("@")[0] ?? "daar") : "daar";
}
