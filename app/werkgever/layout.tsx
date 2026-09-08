import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getPrincipal, hasRole } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { reviewSummary } from "@/lib/reviews/store";
import { prisma } from "@/lib/prisma";
import { getDict, getLocale } from "@/lib/i18n/server";
import { EmployerShell } from "@/components/app/EmployerShell";
import { I18nProvider } from "@/components/i18n/I18nProvider";
import { ChatDock } from "@/components/chat/ChatDock";
import { IRocket, IBriefcase, ICalendar, IHeart, IChat, IBan, IClock, IDoc, IShield, IGrid } from "@/components/app/icons";

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

  const locale = getLocale();
  const t = getDict();
  const nav = [
    { href: "/werkgever", label: t.nav.start, icon: <IRocket /> },
    { href: "/werkgever/diensten", label: t.nav.klussen, icon: <IBriefcase /> },
    { href: "/werkgever/kalender", label: t.nav.kalender, icon: <ICalendar /> },
    { href: "/werkgever/favorieten", label: t.nav.favorieten, icon: <IHeart /> },
    { href: "/werkgever/berichten", label: t.nav.chat, icon: <IChat /> },
    { href: "/werkgever/geblokkeerd", label: t.nav.geblokkeerd, icon: <IBan /> },
    { href: "/werkgever/uren", label: t.nav.urenGoedkeuren, icon: <IClock />, section: t.nav.beheer },
    { href: "/werkgever/facturen", label: t.nav.facturen, icon: <IDoc />, section: t.nav.beheer },
    { href: "/werkgever/compliance", label: t.nav.compliance, icon: <IShield />, section: t.nav.beheer },
    { href: "/werkgever/overeenkomsten", label: t.nav.overeenkomsten, icon: <IDoc />, section: t.nav.beheer },
    { href: "/werkgever/bedrijf", label: t.nav.bedrijfsprofiel, icon: <IGrid />, section: t.nav.beheer },
  ];

  const scope = await resolveEmployerScope(principal);
  const tenantId = scope.tenantIds[0];
  const [tenant, rating] = await Promise.all([
    tenantId
      ? prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } })
      : Promise.resolve(null),
    tenantId ? reviewSummary("company", tenantId) : Promise.resolve(null),
  ]);

  return (
    <I18nProvider locale={locale}>
      <EmployerShell
        nav={nav}
        locale={locale}
        orgName={tenant?.name ?? t.shell.orgFallback}
        rating={rating ? { average: rating.average, count: rating.count } : null}
        userName={principal.fullName}
        userMeta={principal.email}
      >
        {children}
        <ChatDock />
      </EmployerShell>
    </I18nProvider>
  );
}
