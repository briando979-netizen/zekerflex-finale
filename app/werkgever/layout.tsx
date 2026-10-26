import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getPrincipal, hasRole } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { reviewSummary } from "@/lib/reviews/store";
import { prisma } from "@/lib/prisma";
import { getDict, getLocale } from "@/lib/i18n/server";
import { getTheme } from "@/lib/theme/server";
import { inAndroidApp } from "@/lib/app-mode-server";
import { ViewAsBanner } from "@/components/admin/ViewAsBanner";
import { EmployerShell } from "@/components/app/EmployerShell";
import { getUserAvatars } from "@/lib/profile/store";
import { avatarUrlFor } from "@/lib/profile/card";
import { I18nProvider } from "@/components/i18n/I18nProvider";
import { ChatDock } from "@/components/chat/ChatDock";
import { IRocket, IBriefcase, ICalendar, IHeart, IChat, IMail, IBan, IClock, IDoc, IShield, IGrid, IWallet } from "@/components/app/icons";

export const dynamic = "force-dynamic";

export default async function WerkgeverLayout({ children }: { children: ReactNode }) {
  const principal = await getPrincipal();
  if (!principal) redirect("/login?callbackUrl=/werkgever");
  if (!hasRole(principal, "LOCAL_MANAGER", "HQ_ADMIN", "DISPUTE_MANAGER", "PLATFORM_ADMIN")) {
    redirect("/dashboard");
  }

  if (!principal.emailVerifiedAt && !hasRole(principal, "PLATFORM_ADMIN")) {
    redirect("/verifieer-email");
  }

  const locale = await getLocale();
  const theme = await getTheme();
  const t = await getDict();
  // Android app: no ZekerFlex Bank (lib/app-mode.ts)
  const inApp = await inAndroidApp();
  const nav = [
    { href: "/werkgever", label: t.nav.start, icon: <IRocket /> },
    { href: "/werkgever/diensten", label: t.nav.klussen, icon: <IBriefcase /> },
    { href: "/werkgever/kalender", label: t.nav.kalender, icon: <ICalendar /> },
    { href: "/werkgever/agenda", label: t.nav.agenda, icon: <ICalendar /> },
    ...(inApp ? [] : [{ href: "/werkgever/bank", label: t.nav.bank, icon: <IWallet /> }]),
    { href: "/werkgever/favorieten", label: t.nav.favorieten, icon: <IHeart /> },
    { href: "/werkgever/berichten", label: t.nav.chat, icon: <IChat /> },
    { href: "/werkgever/mail", label: t.nav.mail, icon: <IMail /> },
    { href: "/werkgever/whatsapp", label: t.nav.whatsapp, icon: <IChat /> },
    { href: "/werkgever/geblokkeerd", label: t.nav.geblokkeerd, icon: <IBan /> },
    { href: "/werkgever/uren", label: t.nav.urenGoedkeuren, icon: <IClock />, section: t.nav.beheer },
    { href: "/werkgever/facturen", label: t.nav.facturen, icon: <IDoc />, section: t.nav.beheer },
    { href: "/werkgever/compliance", label: t.nav.compliance, icon: <IShield />, section: t.nav.beheer },
    { href: "/werkgever/overeenkomsten", label: t.nav.overeenkomsten, icon: <IDoc />, section: t.nav.beheer },
    { href: "/werkgever/bedrijf", label: t.nav.bedrijfsprofiel, icon: <IGrid />, section: t.nav.beheer },
  ];

  const scope = await resolveEmployerScope(principal);
  const tenantId = scope.tenantIds[0];
  const [tenant, rating, avatars] = await Promise.all([
    tenantId
      ? prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } })
      : Promise.resolve(null),
    tenantId ? reviewSummary("company", tenantId) : Promise.resolve(null),
    getUserAvatars([principal.userId]),
  ]);
  const avatarUrl = avatarUrlFor(principal.userId, Boolean(avatars[principal.userId]));

  return (
    <I18nProvider locale={locale}>
      <ViewAsBanner role="employer" />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-brand-600 focus:px-4 focus:py-2 focus:font-semibold focus:text-white focus:shadow-lg">
        Naar hoofdinhoud
      </a>
      <EmployerShell
        nav={nav}
        locale={locale}
        theme={theme}
        orgName={tenant?.name ?? t.shell.orgFallback}
        rating={rating ? { average: rating.average, count: rating.count } : null}
        userName={principal.fullName}
        userMeta={principal.email}
        avatarUrl={avatarUrl}
      >
        {children}
        <ChatDock />
      </EmployerShell>
    </I18nProvider>
  );
}
