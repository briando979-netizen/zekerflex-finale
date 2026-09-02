import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getPrincipal, hasRole } from "@/lib/auth";
import { AppShell } from "@/components/app/AppShell";
import { ChatDock } from "@/components/chat/ChatDock";
import { ICalendar, IClock, IDoc, IGrid, IShield, IUser, IWallet, IBriefcase, IChat } from "@/components/app/icons";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/dashboard", label: "Overzicht", icon: <IGrid /> },
  { href: "/dashboard/berichten", label: "Berichten", icon: <IChat /> },
  { href: "/dashboard/klussen", label: "Klussen", icon: <IBriefcase />, section: "Werk" },
  { href: "/dashboard/beschikbaarheid", label: "Beschikbaarheid", icon: <IClock />, section: "Werk" },
  { href: "/dashboard/diensten", label: "Mijn diensten", icon: <ICalendar />, section: "Werk" },
  { href: "/dashboard/uitbetalingen", label: "Uitbetalingen", icon: <IWallet />, section: "Geld" },
  { href: "/dashboard/verloning", label: "Verloning", icon: <IWallet />, section: "Geld" },
  { href: "/dashboard/fiscaal", label: "Werkvorm & btw", icon: <IDoc />, section: "Geld" },
  { href: "/dashboard/verificatie", label: "Verificatie", icon: <IShield />, section: "Account" },
  { href: "/dashboard/verzekering", label: "Verzekering", icon: <IShield />, section: "Account" },
  { href: "/dashboard/profiel", label: "Profiel", icon: <IUser />, section: "Account" },
];

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const principal = await getPrincipal();
  if (!principal) redirect("/login?callbackUrl=/dashboard");
  if (!hasRole(principal, "FREELANCER")) redirect("/start");
  if (!principal.emailVerifiedAt) redirect("/verifieer-email");

  return (
    <AppShell
      nav={NAV}
      brandLabel="Freelancer"
      userName={principal.fullName}
      userMeta={principal.email}
    >
      {children}
      <ChatDock />
    </AppShell>
  );
}
