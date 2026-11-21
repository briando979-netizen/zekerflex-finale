import { cookies } from "next/headers";
import { APP_COOKIE, APP_IOS_COOKIE } from "@/lib/app-mode";
import { PWA_COOKIE } from "@/lib/app-vereist";

/** Server components: is this request coming from the Android app? */
export async function inAndroidApp(): Promise<boolean> {
  return (await cookies()).get(APP_COOKIE)?.value === "1";
}

/** Server components: komt dit verzoek uit de iPhone-app? (lib/app-mode.ts APP_IOS_COOKIE) */
export async function inIosApp(): Promise<boolean> {
  const c = await cookies();
  return c.get(APP_COOKIE)?.value === "1" && c.get(APP_IOS_COOKIE)?.value === "1";
}

/**
 * Komt dit verzoek uit een app: de Android-app, de iPhone-app of een geïnstalleerde web-app (cookie zf_pwa, gezet door
 * components/app/AppVereist.tsx zodra de pagina standalone draait)? De werker-omgeving is sinds 21 nov 2026 alleen in de
 * app te gebruiken (lib/app-vereist.ts).
 */
export async function inEigenApp(): Promise<boolean> {
  const c = await cookies();
  return c.get(APP_COOKIE)?.value === "1" || c.get(PWA_COOKIE)?.value === "1";
}
