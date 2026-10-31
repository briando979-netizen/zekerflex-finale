import { hasRole, type Principal } from "@/lib/auth";

// ---------------------------------------------------------------------------
// Admin-override: de platform-eigenaar (PLATFORM_ADMIN) moet élke functie van
// zijn eigen platform kunnen gebruiken en testen zonder betaal-/abonnement-
// drempel. Eén centrale check zodat elke betaalde poort 'm op dezelfde manier
// kan respecteren. Let op: bij "Bekijk als opdrachtgever" is de actieve sessie
// de (alleen-lezen) voorbeeld-opdrachtgever, NIET de admin — dan geldt dit dus
// bewust niet, zodat de admin ziet wat een echte klant ziet.
// ---------------------------------------------------------------------------

export function adminFullAccess(principal: Principal | null | undefined): boolean {
  return Boolean(principal && hasRole(principal, "PLATFORM_ADMIN"));
}
