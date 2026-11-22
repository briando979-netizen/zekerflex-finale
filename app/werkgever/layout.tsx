import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getPrincipal, hasRole } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { reviewSummary } from "@/lib/reviews/store";
import { prisma } from "@/lib/prisma";
import { clientDict, getDict, getLocale } from "@/lib/i18n/server";
import { getTheme } from "@/lib/theme/server";
import { inAndroidApp, inIosApp } from "@/lib/app-mode-server";
import { IosAppProvider } from "@/components/app/useInIosApp";
import { ViewAsBanner } from "@/components/admin/ViewAsBanner";
import { DemoBanner } from "@/components/app/DemoBanner";
import { DEMO_BANNER_WERKGEVER } from "@/components/app/demo-banner-texts";
import { inDemoSessie, VOORBEELD_UITGANG } from "@/lib/auth/demo-sessie";
import { OpbouwfaseBalk } from "@/components/app/OpbouwfaseBalk";
import { EmployerShell } from "@/components/app/EmployerShell";
import { getUserAvatars } from "@/lib/profile/store";
import { avatarUrlFor } from "@/lib/profile/card";
import { I18nProvider } from "@/components/i18n/I18nProvider";
import { ChatDock } from "@/components/chat/ChatDock";
import { SeasonalLoader } from "@/components/seasons/SeasonalLoader";
import { birthdayToday } from "@/lib/seasons/settings";
import { IRocket, IBriefcase, ICalendar, IHeart, IChat, IMail, IBan, IClock, IDoc, IShield, IGrid, IWallet, IPin, IUsers, IActivity, IHelp } from "@/components/app/icons";
import type { NavItem } from "@/components/app/AppShell";
import { menuVoor, SECTIE_NAAM, type MenuSectie, type MenuSleutel } from "@/lib/werkgever/werkruimte";
import { pasMenuVolgordeToe } from "@/lib/werkgever/menu-volgorde";
import { getMenuVolgorde } from "@/lib/werkgever/menu-volgorde-store";
import { werkruimteVan } from "@/lib/werkgever/werkruimte-server";
import { kennisbankIngesteld } from "@/lib/kennisbank/outline";
import { hulpTekstenWerkgever } from "@/lib/hulp/werkgever-teksten";
import { BedrijfRondleiding } from "@/components/app/BedrijfRondleiding";
import { rondleidingBedrijf } from "@/lib/onboarding/rondleiding-bedrijf";
import { outlinePubliekeUrl } from "@/lib/oidc/aanbieder";
import { alleenFlexwerkAan } from "@/lib/seo/verbergen";
import { isUitzendPartnerTenant } from "@/lib/uitzend/partners";

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
  // iPhone-app: geen koopknoppen voor digitale abonnementen (NietInIphone), al bij de eerste weergave
  const ios = await inIosApp();

  const scope = await resolveEmployerScope(principal);
  const tenantId = scope.tenantIds[0];
  const [tenant, rating, avatars, birthday, werkruimte, alleenFlexwerk] = await Promise.all([
    tenantId
      ? prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } })
      : Promise.resolve(null),
    tenantId ? reviewSummary("company", tenantId) : Promise.resolve(null),
    getUserAvatars([principal.userId]),
    birthdayToday(principal.userId).catch(() => false),
    // nog geen klus geplaatst: een kort startmenu (lib/werkgever/werkruimte.ts)
    werkruimteVan(tenantId),
    // vlag `publiek-alleen-flexwerk`: samengevoegde ingangen en een kort startmenu (lib/werkgever/werkruimte.ts)
    alleenFlexwerkAan().catch(() => false),
  ]);
  const avatarUrl = avatarUrlFor(principal.userId, Boolean(avatars[principal.userId]));
  // in een voorbeeld (demo) wordt de uitlogknop een gewone uitgang-link (lib/auth/demo-sessie.ts)
  const demo = await inDemoSessie();

  // elk onderdeel één keer; menuVoor() kiest welke en in welke volgorde
  const onderdelen: Record<MenuSleutel, Omit<NavItem, "section">> = {
    start: { href: "/werkgever", label: t.nav.start, icon: <IRocket /> },
    klussen: { href: "/werkgever/diensten", label: t.nav.klussen, icon: <IBriefcase /> },
    kalender: { href: "/werkgever/kalender", label: t.nav.kalender, icon: <ICalendar /> },
    planner: { href: "/werkgever/planner", label: "Roosterplanner", icon: <ICalendar /> },
    agenda: { href: "/werkgever/agenda", label: t.nav.agenda, icon: <ICalendar /> },
    // met de vlag publiek-alleen-flexwerk: samengevoegde ingangen met tabbladen op de pagina (lib/werkgever/samen-tabs.ts)
    planning: { href: "/werkgever/kalender", label: "Planning", icon: <ICalendar /> },
    werkers: { href: "/werkgever/favorieten", label: "Mijn werkers", icon: <IHeart /> },
    regels: { href: "/werkgever/compliance", label: "Regels en overeenkomsten", icon: <IShield /> },
    cijfers: { href: "/werkgever/rapportages", label: "Cijfers", icon: <IGrid /> },
    bank: { href: "/werkgever/bank", label: t.nav.bank, icon: <IWallet /> },
    favorieten: { href: "/werkgever/favorieten", label: t.nav.favorieten, icon: <IHeart /> },
    berichten: { href: "/werkgever/berichten", label: t.nav.chat, icon: <IChat /> },
    geblokkeerd: { href: "/werkgever/geblokkeerd", label: t.nav.geblokkeerd, icon: <IBan /> },
    // met de vlag aan heet het kortweg "Uren" (goedkeuren én inchecken zitten er als tabbladen onder)
    uren: { href: "/werkgever/uren", label: alleenFlexwerk ? (locale === "en" ? "Hours" : "Uren") : t.nav.urenGoedkeuren, icon: <IClock /> },
    inchecken: { href: "/werkgever/inchecken", label: t.nav.inchecken, icon: <IPin /> },
    assistent: { href: "/werkgever/assistent", label: t.nav.assistent, icon: <IChat /> },
    facturen: { href: "/werkgever/facturen", label: t.nav.facturen, icon: <IDoc /> },
    compliance: { href: "/werkgever/compliance", label: t.nav.compliance, icon: <IShield /> },
    overeenkomsten: { href: "/werkgever/overeenkomsten", label: t.nav.overeenkomsten, icon: <IDoc /> },
    bedrijf: { href: "/werkgever/bedrijf", label: t.nav.bedrijfsprofiel, icon: <IGrid /> },
    rapportages: { href: "/werkgever/rapportages", label: "Rapportages", icon: <IGrid /> },
    // personeel, kosten, ruimtes en bezetting in kaart brengen (lib/inkaart)
    inkaart: { href: "/werkgever/in-kaart", label: t.nav.inkaart, icon: <IActivity /> },
    // de kennisbank staat op een eigen adres (Outline); inloggen gaat vanzelf met het ZekerFlex-account
    kennisbank: { href: `${outlinePubliekeUrl()}/`, label: "Handleidingen", icon: <IDoc /> },
    // het hulpcentrum voor bedrijven op een eigen pagina (lib/hulp/werkgever-teksten.ts); het vraagteken in de kopbalk opent hetzelfde
    hulp: { href: "/werkgever/hulp", label: t.nav.hulp, icon: <IHelp /> },
    // het blok Uitzendbureau, alleen bij een uitzendpartner (lib/uitzend/bureau-kern.ts)
    uitzendAanvragen: { href: "/werkgever/uitzend", label: locale === "en" ? "Requests" : "Aanvragen", icon: <IMail /> },
    uitzendKrachten: { href: "/werkgever/uitzend/krachten", label: locale === "en" ? "Temp workers" : "Uitzendkrachten", icon: <IUsers /> },
    uitzendVerloning: { href: "/werkgever/uitzend/verloning", label: locale === "en" ? "Hours for payroll" : "Uren voor verloning", icon: <IClock /> },
    uitzendKlanten: { href: "/werkgever/uitzend/klanten", label: locale === "en" ? "Clients and locations" : "Klanten en locaties", icon: <IPin /> },
    uitzendBureau: { href: "/werkgever/uitzend/bureau", label: locale === "en" ? "Agency details" : "Bureaugegevens", icon: <IShield /> },
  };
  const sectieNaam = (s: MenuSectie) => (s === "beheer" ? t.nav.beheer : s === "uitzend" && locale === "en" ? "Staffing agency" : SECTIE_NAAM[s]);
  // de volgorde uit de Site-ontwerper (Menu); zonder eigen volgorde of bij een storing exact het gewone menu
  const menuVolgorde = await getMenuVolgorde().catch(() => null);
  // uitzendpartner (lib/uitzend/partners.ts): dan het blok Uitzendbureau; een storing zegt nee
  const uitzendPartner = await isUitzendPartnerTenant(tenantId).catch(() => false);
  const nav: NavItem[] = pasMenuVolgordeToe(
    menuVoor({
      inApp,
      // vlag `publiek-alleen-flexwerk`: samengevoegde ingangen, zonder de losse handleidingen
      alleenFlexwerk,
      // nog geen klus geplaatst: een kort startmenu, de rest komt erbij na de eerste klus
      nogGeenKlussen: !werkruimte.heeftKlussen,
      uitzendPartner,
    }),
    menuVolgorde,
  )
    .filter(({ sleutel }) => sleutel !== "kennisbank" || kennisbankIngesteld())
    .map(({ sleutel, sectie }) => ({
      ...onderdelen[sleutel],
      ...(sectie ? { section: sectieNaam(sectie) } : {}),
    }));

  return (
    <IosAppProvider ios={ios}>
    <I18nProvider locale={locale} t={clientDict(locale)}>
      <ViewAsBanner role="employer" />
      <DemoBanner href={DEMO_BANNER_WERKGEVER.href} knop={DEMO_BANNER_WERKGEVER.knop} />
      <EmployerShell
        nav={nav}
        locale={locale}
        theme={theme}
        orgName={tenant?.name ?? t.shell.orgFallback}
        rating={rating ? { average: rating.average, count: rating.count } : null}
        userName={principal.fullName}
        userMeta={principal.email}
        avatarUrl={avatarUrl}
        canSwitchToFreelancer={hasRole(principal, "FREELANCER")}
        // het vraagteken: het hulpcentrum voor bedrijven, alleen de teksten in de taal van de app gaan mee (lib/hulp/werkgever-teksten.ts)
        hulp={hulpTekstenWerkgever(locale)}
        handleidingen={kennisbankIngesteld() ? `${outlinePubliekeUrl()}/` : null}
        // "ZekerFlex OS" onderin de zijbalk: met de vlag aan alleen voor een platformbeheerder (een bedrijf dat personeel zoekt snapt het niet, 20 nov)
        toonOs={!alleenFlexwerk || hasRole(principal, "PLATFORM_ADMIN")}
        // met de vlag aan één plek voor bedrijfsgegevens: Bedrijfsprofiel (met daar een knop Instellingen), geen losse regel onderin
        toonInstellingen={!alleenFlexwerk}
        {...(demo ? { demoUitgang: VOORBEELD_UITGANG } : {})}
      >
        <OpbouwfaseBalk soort="werkgever" />
        {children}
        <ChatDock />
        {/* de rondleiding voor bedrijven: na de eerste sessie één keer, daarna via het vraagteken (lib/onboarding/rondleiding-bedrijf.ts) */}
        <BedrijfRondleiding t={rondleidingBedrijf(locale)} />
        {birthday && <SeasonalLoader theme="verjaardag" naam={principal.fullName.split(" ")[0] ?? null} />}
      </EmployerShell>
    </I18nProvider>
    </IosAppProvider>
  );
}
