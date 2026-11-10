import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getPrincipal, hasRole } from "@/lib/auth";
import { inAndroidApp } from "@/lib/app-mode-server";
import { WELKOM_COOKIE, instroomBestemming } from "@/lib/welkom/slides";

export const dynamic = "force-dynamic";

/** Post-login router: forwards to the home screen for the principal's role. */
export default async function StartPage(props: { searchParams: Promise<{ utm_source?: string }> }) {
  const principal = await getPrincipal();
  if (!principal) {
    // In de app: een eerste bezoeker naar de welkomstcarrousel, een teruggekeerde naar het inlogscherm.
    // De allereerste start zet de app-cookie pas in dit antwoord, dus ook utm_source tellen.
    const { utm_source: bron } = await props.searchParams;
    const inApp = (await inAndroidApp()) || bron === "twa" || bron === "ios";
    const gezien = (await cookies()).get(WELKOM_COOKIE)?.value === "1";
    redirect(instroomBestemming({ inApp, gezien }));
  }

  const isPlatformAdmin = hasRole(principal, "PLATFORM_ADMIN");

  // E-mail verification is required for everyone except the platform admin.
  if (!isPlatformAdmin && !principal.emailVerifiedAt) {
    redirect("/verifieer-email");
  }

  if (isPlatformAdmin) redirect("/admin");
  if (hasRole(principal, "SALES")) redirect("/sales");
  if (hasRole(principal, "HQ_ADMIN", "LOCAL_MANAGER", "DISPUTE_MANAGER")) {
    redirect("/werkgever");
  }
  redirect("/dashboard");
}
