"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { NotificationsBell } from "@/components/app/NotificationsBell";
import { PushSelfHeal } from "@/components/app/PushToggle";
import { HulpCentrum } from "@/components/app/HulpCentrum";
import { WerkerRondleiding } from "@/components/app/WerkerRondleiding";
import type { HulpTeksten } from "@/lib/hulp/hulpjes";
import { IBriefcase, IClock, IChat, IUser, ISearch, IUsers, IWallet } from "@/components/app/icons";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import type { Theme } from "@/lib/theme/config";
import { useI18n, setLocale } from "@/components/i18n/I18nProvider";
import { useFT } from "@/components/i18n/useFT";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n/config";
import { BANK_AAN } from "@/lib/app-mode";
import { sorteerTabs } from "@/lib/werker/tab-volgorde";
import { schermTitelSleutel } from "@/lib/werker/schermtitel";
import { WinterSneeuw } from "@/components/thema/WinterSneeuw";

// ---------------------------------------------------------------------------
// Freelancer workspace shell — YoungOnes-style: a slim top bar and a
// 6-item bottom navigation (full-width bar on mobile, a floating pill on
// desktop). No left sidebar. Sinds 20 nov (eigenaar: "precies zoals YoungOnes, alleen de chat blijft"): standaard
// donker met een turquoise accent (werker-regels in app/globals.css, via data-app="werker"), de kop in kapitalen,
// Ontdekken met een vergrootglas en "Uren invullen" als naam van de urentab; de chat-tab blijft.
// ---------------------------------------------------------------------------

const TABS = [
  { href: "/dashboard/klussen", key: "discover", icon: <ISearch /> },
  { href: "/dashboard/diensten", key: "myJobs", icon: <IBriefcase /> },
  { href: "/dashboard/uren", key: "hours", icon: <IClock /> },
  { href: "/dashboard/bank", key: "bank", icon: <IWallet /> },
  { href: "/dashboard/berichten", key: "chat", icon: <IChat /> },
  { href: "/dashboard/account", key: "account", icon: <IUser /> },
] as const;

/**
 * Pushes are written in the language stored on the server (lib/i18n/worker-locale.ts),
 * set when the language is changed. Workers who picked theirs before that existed
 * have no server copy yet: send it once per browser session. Dutch is the default anyway.
 */
function useLocaleSync() {
  const { locale } = useI18n();
  useEffect(() => {
    if (locale === "nl") return;
    try {
      if (sessionStorage.getItem("zf-taal-sync") === locale) return;
      sessionStorage.setItem("zf-taal-sync", locale);
      navigator.sendBeacon?.("/api/me/taal", new Blob([JSON.stringify({ locale })], { type: "application/json" }));
    } catch {
      /* private mode / no beacon: the next language change stores it */
    }
  }, [locale]);
}

/** Compact language picker (flexworkers: NL/EN/PL/RO/UK). */
function LanguageButton() {
  const { locale } = useI18n();
  const t = useFT();
  return (
    // op een telefoon niet in de balk (die heeft alleen zoeken, hulp en de bel, zoals de app van YoungOnes); de taal staat op Account
    <label className="relative hidden h-11 w-11 place-items-center rounded-lg border border-hairstrong text-neutralx-500 transition hover:text-ink sm:grid" title={t.lang.label}>
      <span aria-hidden className="text-[11px] font-bold uppercase">{locale}</span>
      <select
        aria-label={t.lang.label}
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {LOCALES.map((code) => (
          <option key={code} value={code}>
            {LOCALE_LABELS[code]}
          </option>
        ))}
      </select>
    </label>
  );
}

export function FreelancerShell({
  userName,
  avatarUrl,
  theme,
  inApp = false,
  canSwitchToEmployer = false,
  isSalesPartner = false,
  hulp,
  handleidingen = null,
  tabVolgorde = null,
  children,
}: {
  /** het hulpcentrum achter het vraagteken, in de taal van de werker (lib/hulp/teksten.ts) */
  hulp?: HulpTeksten;
  /** adres van de handleidingen (Outline); null = niet ingesteld */
  handleidingen?: string | null;
  /** eigen volgorde van de knoppen in de balk (lib/werker/tab-volgorde.ts); null = de standaard */
  tabVolgorde?: readonly string[] | null;
  userName: string;
  /** Eigen profielfoto — toont in de Account-tab i.p.v. het poppetje-icoon. */
  avatarUrl?: string | null;
  theme: Theme;
  /** Android app: no Bank tab (lib/app-mode.ts) */
  inApp?: boolean;
  canSwitchToEmployer?: boolean;
  /** sales partner (lib/sales-partners): een knop naar het partnerdashboard (/partner) */
  isSalesPartner?: boolean;
  children: ReactNode;
}) {
  useLocaleSync();
  const zichtbaar = inApp || !BANK_AAN ? TABS.filter((t) => t.key !== "bank") : TABS;
  // de volgorde uit de Site-ontwerper (Menu); zonder eigen volgorde dezelfde lijst terug
  const tabs = sorteerTabs(zichtbaar, tabVolgorde);
  const pathname = usePathname();
  const ft = useFT();
  const isActive = (href: string) =>
    pathname === href ||
    pathname.startsWith(href + "/") ||
    // "/dashboard" root and shift detail count as Ontdekken
    (href === "/dashboard/klussen" && (pathname === "/dashboard" || pathname.startsWith("/dashboard/klussen")));

  // Focused full-screen views (a single klus) hide the tab bar so a page-owned
  // action bar can take its place.
  // het startscherm van een nieuwe werker (/dashboard/start) is ook zo'n volscherm: twee stappen zonder balken
  const focused = /^\/dashboard\/klussen\/[^/]+$/.test(pathname) || pathname === "/dashboard/start" || pathname === "/dashboard/start/profiel";
  const current = tabs.find((t) => isActive(t.href));
  // Een scherm uit de balk onderaan heeft zijn eigen naam; elk ander scherm (Verificatie, Profiel, Hulp, ...)
  // krijgt die van lib/werker/schermtitel.ts in plaats van "Vind jouw klus".
  const title = !current
    ? ft.schermTitel[schermTitelSleutel(pathname)]
    : current.href === "/dashboard/klussen"
      ? ft.nav.findJob
      : ft.nav[current.key];

  return (
    <div data-theme={theme} data-app="werker" className="app-scope app-bg noise flex min-h-screen flex-col bg-paper-soft">
      {/* Top bar */}
      {!focused && (
        <header className="werker-kop sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-hair bg-white/85 px-4 backdrop-blur-xl lg:px-8">
          <WinterSneeuw />
          <Link href="/dashboard/klussen" className="font-display text-base font-extrabold uppercase tracking-tight text-ink">
            {title}
          </Link>
          <div className="ml-auto flex items-center gap-2">
            {isSalesPartner && (
              <Link
                href="/partner"
                aria-label={ft.nav.partnerDashboard}
                title={ft.nav.partnerDashboard}
                className="grid h-11 w-11 place-items-center rounded-lg border border-hairstrong text-neutralx-500 transition hover:text-brand-600"
              >
                <IUsers />
              </Link>
            )}
            {canSwitchToEmployer && (
              <Link
                href="/werkgever"
                aria-label={ft.nav.employerWorkspace}
                title={ft.nav.employerWorkspace}
                className="hidden h-11 w-11 place-items-center rounded-lg border border-hairstrong text-neutralx-500 transition hover:text-brand-600 sm:grid"
              >
                <IBriefcase />
              </Link>
            )}
            <LanguageButton />
            {/* de knop licht/donker blijft altijd in de balk (21 nov, eigenaar: "die donkere weergave-knop wou ik wel houden") */}
            <ThemeToggle
              theme={theme}
              texts={ft.accountDelen.thema}
              className="grid h-11 w-11 place-items-center rounded-lg border border-hairstrong text-neutralx-500 transition hover:text-ink"
            />
            {/* zoeken: naar het zoekveld boven de klussen (zoals het vergrootglas in de balk van YoungOnes) */}
            <Link
              href="/dashboard/klussen#zoeken"
              aria-label={ft.nav.search}
              className="grid h-11 w-11 place-items-center rounded-lg border border-hairstrong text-neutralx-500 transition hover:text-ink"
            >
              <ISearch />
            </Link>
            {hulp && <HulpCentrum t={hulp} handleidingen={handleidingen} />}
            <NotificationsBell texts={ft.meldingen} app="werker" />
            <PushSelfHeal />
          </div>
          {/* in de kopbalk (een landmark), niet los onderaan de pagina */}
          <span className="sr-only">Ingelogd als {userName}</span>
        </header>
      )}

      <main
        id="main"
        tabIndex={-1}
        key={pathname}
        className={`relative flex-1 animate-slide-up-fade outline-none ${
          focused ? "" : "px-4 pb-28 pt-6 lg:px-8"
        }`}
      >
        <div className={focused ? "" : "mx-auto max-w-3xl"}>
          {children}
        </div>
      </main>

      {/* Bottom navigation */}
      {!focused && (
      <nav
        aria-label="Hoofdnavigatie"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-hair bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:inset-x-auto lg:bottom-4 lg:left-1/2 lg:-translate-x-1/2 lg:rounded-full lg:border lg:border-hair lg:px-2 lg:pb-0 lg:shadow-lift"
      >
        <ul className="mx-auto flex max-w-lg items-stretch justify-between lg:max-w-none lg:gap-1">
          {tabs.map((t) => {
            const active = isActive(t.href);
            return (
              <li key={t.href} className="flex-1 lg:flex-none">
                <Link
                  href={t.href}
                  aria-current={active ? "page" : undefined}
                  data-rondleiding={t.key}
                  className={`flex flex-col items-center gap-0.5 px-0.5 py-2.5 text-[11px] font-medium transition lg:flex-row lg:gap-2 lg:rounded-full lg:px-4 lg:py-2.5 ${
                    active
                      ? "text-brand-600 lg:bg-ink lg:text-white"
                      : "text-neutralx-400 hover:text-neutralx-600 lg:hover:bg-paper-soft"
                  }`}
                  title={ft.nav[t.key]}
                >
                  <span className="grid h-5 w-5 place-items-center">
                    {t.key === "account" && avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={avatarUrl}
                        alt=""
                        className={`h-5 w-5 rounded-full object-cover ${active ? "ring-2 ring-brand-500 ring-offset-1" : ""}`}
                      />
                    ) : (
                      t.icon
                    )}
                  </span>
                  <span className={`max-w-full truncate whitespace-nowrap ${active ? "" : "lg:hidden"}`}>{ft.nav[t.key]}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      )}
      {/* de rondleiding door de app: na de eerste sessie één keer, daarna via Hulp (lib/onboarding/rondleiding.ts) */}
      <WerkerRondleiding />
    </div>
  );
}
