import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getPrincipal, hasRole } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { isEmployerOnboarded } from "@/lib/onboarding/employer";
import { AppShell } from "@/components/app/AppShell";
import { ChatDock } from "@/components/chat/ChatDock";
import { IGrid, ICalendar, IClock, IDoc, IShield, IChat } from "@/components/app/icons";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/werkgever", label: "Overzicht", icon: <IGrid /> },
  { href: "/werkgever/berichten", label: "Berichten", icon: <IChat /> },
  { href: "/werkgever/diensten", label: "Diensten", icon: <ICalendar />, section: "Werk" },
  { href: "/werkgever/uren", label: "Uren goedkeuren", icon: <IClock />, section: "Werk" },
  { href: "/werkgever/facturen", label: "Facturen", icon: <IDoc />, section: "Financieel" },
  { href: "/werkgever/compliance", label: "Compliance", icon: <IShield />, section: "Financieel" },
  { href: "/werkgever/overeenkomsten", label: "Modelovereenkomsten", icon: <IDoc />, section: "Financieel" },
  { href: "/werkgever/bedrijf", label: "Bedrijfsprofiel", icon: <IGrid />, section: "Organisatie" },
];

export default async function WerkgeverLayout({ children }: { children: ReactNode }) {
  const principal = await getPrincipal();
  if (!principal) redirect("/login?callbackUrl=/werkgever");
  if (!hasRole(principal, "LOCAL_MANAGER", "HQ_ADMIN", "DISPUTE_MANAGER", "PLATFORM_ADMIN")) {
    redirect("/dashboard");
  }

  const path = headers().get("x-pathname") ?? "";
  const onOnboarding = path.startsWith("/werkgever/onboarding");

  // E-mail verification applies everywhere (also on the onboarding page).
  if (!principal.emailVerifiedAt && !hasRole(principal, "PLATFORM_ADMIN")) {
    redirect("/verifieer-email");
  }

  // HQ admins of a brand-new organization must finish company onboarding first.
  if (!onOnboarding && hasRole(principal, "HQ_ADMIN") && !hasRole(principal, "PLATFORM_ADMIN")) {
    const scope = await resolveEmployerScope(principal);
    if (!(await isEmployerOnboarded(scope.tenantIds))) {
      redirect("/werkgever/onboarding");
    }
  }

  return (
    <AppShell nav={NAV} brandLabel="Werkgever" userName={principal.fullName} userMeta={principal.email}>
      {children}
      <ChatDock />
    </AppShell>
  );
}
