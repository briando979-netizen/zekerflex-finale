import { hasRole, type Principal } from "@/lib/auth";
import { ZAKELIJKE_ROLLEN } from "@/lib/chat/zakelijk";

/** Krijgt deze persoon de zakelijke weergave van de chat? Een bedrijf wel, een platformbeheerder niet (lib/chat/zakelijk.ts). */
export function isZakelijk(p: Principal): boolean {
  return !hasRole(p, "PLATFORM_ADMIN") && hasRole(p, ...ZAKELIJKE_ROLLEN);
}
