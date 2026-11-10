import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getPrincipal, hasRole } from "@/lib/auth";
import { getTheme } from "@/lib/theme/server";
import { FreelancerShell } from "@/components/app/FreelancerShell";
import { ChatDock } from "@/components/chat/ChatDock";
import { SeasonalLoader } from "@/components/seasons/SeasonalLoader";
import { birthdayToday } from "@/lib/seasons/settings";
import { I18nProvider } from "@/components/i18n/I18nProvider";
import { clientDict, getLocale } from "@/lib/i18n/server";
import { inAndroidApp, inIosApp } from "@/lib/app-mode-server";
import { IosAppProvider } from "@/components/app/useInIosApp";
import { IbanHoldBanner } from "@/components/app/IbanHoldBanner";
import { OnboardingPoort } from "@/components/app/OnboardingPoort";
import { WerkerOnboardingScherm } from "@/components/app/WerkerOnboardingScherm";
import { werkerPoortStand } from "@/lib/onboarding/werker-poort-server";
import { isReservedTestAddress } from "@/lib/mail";
import { AppOpenPing } from "@/components/app/AppOpenPing";
import { BewaardeTikken } from "@/components/app/BewaardeTikken";
import { ViewAsBanner } from "@/components/admin/ViewAsBanner";
import { getUserAvatars } from "@/lib/profile/store";
import { avatarUrlFor } from "@/lib/profile/card";
import { hulpTeksten } from "@/lib/hulp/teksten";
import { kennisbankIngesteld } from "@/lib/kennisbank/outline";
import { outlinePubliekeUrl } from "@/lib/oidc/aanbieder";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const principal = await getPrincipal();
  if (!principal) redirect("/login?callbackUrl=/dashboard");
  if (!hasRole(principal, "FREELANCER")) redirect("/start");
  if (!principal.emailVerifiedAt) redirect("/verifieer-email");

  const theme = await getTheme();
  const locale = await getLocale();
  const [avatars, birthday] = await Promise.all([getUserAvatars([principal.userId]), birthdayToday(principal.userId).catch(() => false)]);
  const avatarUrl = avatarUrlFor(principal.userId, Boolean(avatars[principal.userId]));
  // eerst de onboarding helemaal invullen, dan de rest (lib/onboarding/werker-poort.ts); een storing gooit de app niet dicht
  // Testaccounts (.test/.example, alleen door ons aangemaakt; zelf aanmelden kan niet, de mail komt nooit aan)
  // vallen erbuiten: de beoordelaar van Apple en Google kan geen echte ID-controle doen. Aannemen
  // blijft voor hen dicht (lib/fiscal/eligibility.ts).
  const poort = isReservedTestAddress(principal.email) ? null : await werkerPoortStand(principal.userId).catch(() => null);
  const onboardingKlaar = poort?.klaar ?? true;

  return (
    <IosAppProvider ios={await inIosApp()}>
    <I18nProvider locale={locale} t={clientDict(locale)}>
      <ViewAsBanner role="freelancer" />
      <FreelancerShell
        userName={principal.fullName}
        avatarUrl={avatarUrl}
        theme={theme}
        inApp={await inAndroidApp()}
        canSwitchToEmployer={hasRole(principal, "LOCAL_MANAGER", "HQ_ADMIN", "DISPUTE_MANAGER", "PLATFORM_ADMIN")}
        onboarding={!onboardingKlaar}
        // het vraagteken: alleen de teksten in de taal van de werker gaan mee (lib/hulp/teksten.ts)
        hulp={hulpTeksten(locale)}
        handleidingen={kennisbankIngesteld() ? `${outlinePubliekeUrl()}/` : null}
      >
        <IbanHoldBanner userId={principal.userId} />
        {/* in- en uitchecks die zonder bereik zijn bewaard: versturen zodra het kan (lib/checkin/wachtrij.ts) */}
        <BewaardeTikken userId={principal.userId} />
        {/* de opbouwfase-balk staat niet meer bij werkers (10 nov, eigenaar); de welkomstmail vertelt het al */}
        <OnboardingPoort klaar={onboardingKlaar} start={poort && !onboardingKlaar ? <WerkerOnboardingScherm stand={poort} /> : null}>
          {children}
        </OnboardingPoort>
        <ChatDock />
        <AppOpenPing />
        {birthday && <SeasonalLoader theme="verjaardag" naam={principal.fullName.split(" ")[0] ?? null} />}
      </FreelancerShell>
    </I18nProvider>
    </IosAppProvider>
  );
}
