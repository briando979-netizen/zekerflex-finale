import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getPrincipal, hasRole } from "@/lib/auth";
import { getTheme } from "@/lib/theme/server";
import { FreelancerShell } from "@/components/app/FreelancerShell";
import { ChatDock } from "@/components/chat/ChatDock";
import { I18nProvider } from "@/components/i18n/I18nProvider";
import { getLocale } from "@/lib/i18n/server";
import { inAndroidApp } from "@/lib/app-mode-server";
import { IbanHoldBanner } from "@/components/app/IbanHoldBanner";
import { ViewAsBanner } from "@/components/admin/ViewAsBanner";
import { getUserAvatars } from "@/lib/profile/store";
import { avatarUrlFor } from "@/lib/profile/card";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const principal = await getPrincipal();
  if (!principal) redirect("/login?callbackUrl=/dashboard");
  if (!hasRole(principal, "FREELANCER")) redirect("/start");
  if (!principal.emailVerifiedAt) redirect("/verifieer-email");

  const theme = await getTheme();
  const locale = await getLocale();
  const avatars = await getUserAvatars([principal.userId]);
  const avatarUrl = avatarUrlFor(principal.userId, Boolean(avatars[principal.userId]));

  return (
    <I18nProvider locale={locale}>
      <ViewAsBanner role="freelancer" />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-brand-600 focus:px-4 focus:py-2 focus:font-semibold focus:text-white focus:shadow-lg">
        Naar hoofdinhoud
      </a>
      <FreelancerShell userName={principal.fullName} avatarUrl={avatarUrl} theme={theme} inApp={await inAndroidApp()}>
        <IbanHoldBanner userId={principal.userId} />
        {children}
        <ChatDock />
      </FreelancerShell>
    </I18nProvider>
  );
}
