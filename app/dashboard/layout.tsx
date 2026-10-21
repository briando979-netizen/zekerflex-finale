import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getPrincipal, hasRole } from "@/lib/auth";
import { getTheme } from "@/lib/theme/server";
import { FreelancerShell } from "@/components/app/FreelancerShell";
import { ChatDock } from "@/components/chat/ChatDock";
import { I18nProvider } from "@/components/i18n/I18nProvider";
import { getLocale } from "@/lib/i18n/server";
import { inAndroidApp } from "@/lib/app-mode-server";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const principal = await getPrincipal();
  if (!principal) redirect("/login?callbackUrl=/dashboard");
  if (!hasRole(principal, "FREELANCER")) redirect("/start");
  if (!principal.emailVerifiedAt) redirect("/verifieer-email");

  const theme = await getTheme();
  const locale = await getLocale();

  return (
    <I18nProvider locale={locale}>
      <FreelancerShell userName={principal.fullName} theme={theme} inApp={await inAndroidApp()}>
        {children}
        <ChatDock />
      </FreelancerShell>
    </I18nProvider>
  );
}
