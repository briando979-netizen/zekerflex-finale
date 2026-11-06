import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getPrincipal, hasRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ZekerFlex Sites",
  robots: { index: false, follow: false },
};

// ZekerFlex Sites: twee aparte werkruimtes, /studio/website (Website bouwen) en
// /studio/webshop (Webshop openen), elk met een eigen shell (components/studio/StudioShell.tsx).
// Wie de site van welk bedrijf mag bewerken, controleren de API's
// (lib/sites/access.ts siteTenantOf); hier alleen: ingelogd en beheerder.
export default async function StudioLayout({ children }: { children: ReactNode }) {
  const principal = await getPrincipal();
  if (!principal) redirect("/login?callbackUrl=/studio");
  if (!hasRole(principal, "HQ_ADMIN", "PLATFORM_ADMIN")) redirect("/werkgever");
  if (!principal.emailVerifiedAt && !hasRole(principal, "PLATFORM_ADMIN")) redirect("/verifieer-email");
  return <>{children}</>;
}
