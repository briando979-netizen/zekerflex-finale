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
import { OpbouwfaseBalk } from "@/components/app/OpbouwfaseBalk";
import { EmployerShell } from "@/components/app/EmployerShell";
import { getUserAvatars } from "@/lib/profile/store";
import { avatarUrlFor } from "@/lib/profile/card";
import { I18nProvider } from "@/components/i18n/I18nProvider";
import { ChatDock } from "@/components/chat/ChatDock";
import { SeasonalLoader } from "@/components/seasons/SeasonalLoader";
import { birthdayToday } from "@/lib/seasons/settings";
import type { ReactElement } from "react";
import { IRocket, IBriefcase, ICalendar, IHeart, IChat, IMail, IBan, IClock, IDoc, IShield, IGrid, IWallet, IGlobe, IPhone, ICar, IStar, IList, IPin, IUsers, IImage, ISettings, IActivity } from "@/components/app/icons";
import type { NavItem } from "@/components/app/AppShell";
import { menuVoor, SECTIE_NAAM, type MenuSectie, type MenuSleutel } from "@/lib/werkgever/werkruimte";
import { werkruimteVan } from "@/lib/werkgever/werkruimte-server";
import { kennisbankIngesteld } from "@/lib/kennisbank/outline";
import { outlinePubliekeUrl } from "@/lib/oidc/aanbieder";
import { featureEnabled } from "@/lib/flags";
import { heeftAfspraken } from "@/lib/afspraken/in-menu";

export const dynamic = "force-dynamic";

/** Een eigen icoon per tabblad van het rijschool- en horecabeheer in het menu. */
const TAB_ICOON: Record<string, ReactElement> = {
  overzicht: <IGrid />,
  agenda: <ICalendar />,
  leerlingen: <IUsers />,
  berichten: <IChat />,
  betalingen: <IWallet />,
  team: <ICar />,
  pakketten: <IList />,
  website: <IGlobe />,
  instellingen: <ISettings />,
  app: <IPhone />,
  reserveringen: <ICalendar />,
  bestellingen: <IList />,
  tafels: <IGrid />,
  kassa: <IWallet />,
  taken: <IClock />,
  cijfers: <IActivity />,
  menukaart: <IDoc />,
  schermen: <IImage />,
  modules: <IStar />,
  gegevens: <ISettings />,
};

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
  const [tenant, rating, avatars, birthday, werkruimte, metAfspraken] = await Promise.all([
    tenantId
      ? prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } })
      : Promise.resolve(null),
    tenantId ? reviewSummary("company", tenantId) : Promise.resolve(null),
    getUserAvatars([principal.userId]),
    birthdayToday(principal.userId).catch(() => false),
    // het open dashboard (personeel, rijschool, horeca, website, webshop) bepaalt het menu (lib/werkgever/werkruimte.ts)
    werkruimteVan(tenantId),
    // staat Afspraken in het menu? Alleen als het bedrijf het heeft ingericht; een storing geeft false
    heeftAfspraken(tenantId),
  ]);
  const avatarUrl = avatarUrlFor(principal.userId, Boolean(avatars[principal.userId]));

  // elk onderdeel één keer; de werkruimte kiest welke en in welke volgorde
  const onderdelen: Record<MenuSleutel, Omit<NavItem, "section">> = {
    start: { href: "/werkgever", label: t.nav.start, icon: <IRocket /> },
    rijschool: { href: "/werkgever/rijschool", label: "Rijschool inrichten", icon: <ICar /> },
    horeca: { href: "/werkgever/horeca", label: "Zaak inrichten", icon: <IList /> },
    studio: { href: "/studio/website", label: "Website bouwen", icon: <IGlobe /> },
    winkel: { href: "/studio/webshop", label: "Webshop", icon: <IGlobe /> },
    klussen: { href: "/werkgever/diensten", label: t.nav.klussen, icon: <IBriefcase /> },
    kalender: { href: "/werkgever/kalender", label: t.nav.kalender, icon: <ICalendar /> },
    planner: { href: "/werkgever/planner", label: "Roosterplanner", icon: <ICalendar /> },
    agenda: { href: "/werkgever/agenda", label: t.nav.agenda, icon: <ICalendar /> },
    bank: { href: "/werkgever/bank", label: t.nav.bank, icon: <IWallet /> },
    favorieten: { href: "/werkgever/favorieten", label: t.nav.favorieten, icon: <IHeart /> },
    berichten: { href: "/werkgever/berichten", label: t.nav.chat, icon: <IChat /> },
    mail: { href: "/werkgever/mail", label: t.nav.mail, icon: <IMail /> },
    whatsapp: { href: "/werkgever/whatsapp", label: t.nav.whatsapp, icon: <IChat /> },
    geblokkeerd: { href: "/werkgever/geblokkeerd", label: t.nav.geblokkeerd, icon: <IBan /> },
    uren: { href: "/werkgever/uren", label: t.nav.urenGoedkeuren, icon: <IClock /> },
    inchecken: { href: "/werkgever/inchecken", label: t.nav.inchecken, icon: <IPin /> },
    assistent: { href: "/werkgever/assistent", label: t.nav.assistent, icon: <IChat /> },
    facturen: { href: "/werkgever/facturen", label: t.nav.facturen, icon: <IDoc /> },
    compliance: { href: "/werkgever/compliance", label: t.nav.compliance, icon: <IShield /> },
    overeenkomsten: { href: "/werkgever/overeenkomsten", label: t.nav.overeenkomsten, icon: <IDoc /> },
    bedrijf: { href: "/werkgever/bedrijf", label: t.nav.bedrijfsprofiel, icon: <IGrid /> },
    website: { href: "/werkgever/website", label: "Website-beheer", icon: <IGlobe /> },
    telefonie: { href: "/werkgever/telefonie", label: "Telefonie", icon: <IPhone /> },
    reviews: { href: "/werkgever/google-reviews", label: "Google-reviews", icon: <IStar /> },
    netwerk: { href: "/werkgever/netwerk", label: "Wifi en VPN", icon: <IShield /> },
    rapportages: { href: "/werkgever/rapportages", label: "Rapportages", icon: <IGrid /> },
    // de kennisbank staat op een eigen adres (Outline); inloggen gaat vanzelf met het ZekerFlex-account
    kennisbank: { href: `${outlinePubliekeUrl()}/`, label: "Handleidingen", icon: <IDoc /> },
    locatie: { href: "/werkgever/op-locatie", label: "Op locatie", icon: <IGrid /> },
    // per soort bedrijf een dashboard met alles wat erbij hoort (lib/branches)
    branche: { href: "/werkgever/branche", label: "Jouw branche", icon: <IList /> },
    // alleen in het menu als het bedrijf afspraken heeft ingericht (lib/afspraken/in-menu.ts); "Klantenkaart", want horeca en rijschool hebben al een groep "Klanten en contact"
    afspraken: { href: "/werkgever/afspraken", label: "Afspraken", icon: <ICalendar /> },
    klanten: { href: "/werkgever/klanten", label: "Klantenkaart", icon: <IUsers /> },
  };
  // de netwerkpakketten zijn zonder uitrol uit te zetten (Admin → Systeem → Schakelaars)
  const netwerkAan = await featureEnabled("netwerk-pakketten", { userId: principal.userId });
  // de Op locatie-modules (portofoon, toegang, kluis, printen) ook (lib/locatie)
  const locatieAan = await featureEnabled("locatie-modules", { userId: principal.userId });
  const sectieNaam = (s: MenuSectie) => (s === "beheer" ? t.nav.beheer : SECTIE_NAAM[s]);
  // de beheerder: studio, rijschool- en horecabeheer, dashboards toevoegen
  const beheerder = hasRole(principal, "HQ_ADMIN", "PLATFORM_ADMIN");
  const nav: NavItem[] = menuVoor(werkruimte.soort, {
    heeftAfspraken: metAfspraken,
    heeftRijschool: werkruimte.heeftRijschool,
    heeftHoreca: werkruimte.heeftHoreca,
    horecaModules: werkruimte.horecaModules,
    inApp,
    // de studio eist HQ_ADMIN of PLATFORM_ADMIN (app/studio/layout.tsx)
    studio: beheerder,
  })
    .filter(({ sleutel }) => sleutel !== "netwerk" || netwerkAan)
    .filter(({ sleutel }) => sleutel !== "kennisbank" || kennisbankIngesteld())
    .filter(({ sleutel }) => sleutel !== "locatie" || locatieAan)
    .map(({ sleutel, sectie, tab }) => ({
      ...onderdelen[sleutel],
      // een tabblad van het rijschool- of horecabeheer als eigen onderdeel (lib/rijschool/tabs.ts, lib/horeca/tabs.ts)
      ...(tab ? { href: `${onderdelen[sleutel].href}?tab=${tab.id}`, label: tab.label, icon: TAB_ICOON[tab.id] ?? onderdelen[sleutel].icon } : {}),
      ...(sectie ? { section: sectieNaam(sectie) } : {}),
    }));

  return (
    <IosAppProvider ios={ios}>
    <I18nProvider locale={locale} t={clientDict(locale)}>
      <ViewAsBanner role="employer" />
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
        dashboards={{ actief: werkruimte.soort, dashboards: werkruimte.dashboards, kanToevoegen: beheerder }}
      >
        <OpbouwfaseBalk soort="werkgever" />
        {children}
        <ChatDock />
        {birthday && <SeasonalLoader theme="verjaardag" naam={principal.fullName.split(" ")[0] ?? null} />}
      </EmployerShell>
    </I18nProvider>
    </IosAppProvider>
  );
}
