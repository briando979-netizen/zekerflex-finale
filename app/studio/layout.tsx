import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getPrincipal, hasRole } from "@/lib/auth";
import { StudioShell } from "@/components/studio/StudioShell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Websitestudio | ZekerFlex",
  robots: { index: false, follow: false },
};

// De Websitestudio: de website en webshop van een bedrijf beheren, op een eigen
// scherm. Wie de site van welk bedrijf mag bewerken, controleren de API's
// (lib/sites/access.ts siteTenantOf); hier alleen: ingelogd en beheerder.
export default async function StudioLayout({ children }: { children: ReactNode }) {
  const principal = await getPrincipal();
  if (!principal) redirect("/login?callbackUrl=/studio");
  if (!hasRole(principal, "HQ_ADMIN", "PLATFORM_ADMIN")) redirect("/werkgever");
  if (!principal.emailVerifiedAt && !hasRole(principal, "PLATFORM_ADMIN")) redirect("/verifieer-email");
  return <StudioShell>{children}</StudioShell>;
}
