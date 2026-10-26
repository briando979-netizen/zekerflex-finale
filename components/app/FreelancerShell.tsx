"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { NotificationsBell } from "@/components/app/NotificationsBell";
import { PushToggle } from "@/components/app/PushToggle";
import { ICompass, IBriefcase, IClock, IChat, IUser, ISearch, IWallet } from "@/components/app/icons";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import type { Theme } from "@/lib/theme/config";
import { useI18n, useFT, setLocale } from "@/components/i18n/I18nProvider";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n/config";

// ---------------------------------------------------------------------------
// Freelancer workspace shell — YoungOnes-style: a slim top bar and a
// 6-item bottom navigation (full-width bar on mobile, a floating pill on
// desktop). No left sidebar.
// ---------------------------------------------------------------------------

const TABS = [
  { href: "/dashboard/klussen", key: "discover", icon: <ICompass /> },
  { href: "/dashboard/diensten", key: "myJobs", icon: <IBriefcase /> },
  { href: "/dashboard/uren", key: "hours", icon: <IClock /> },
  { href: "/dashboard/bank", key: "bank", icon: <IWallet /> },
  { href: "/dashboard/berichten", key: "chat", icon: <IChat /> },
  { href: "/dashboard/account", key: "account", icon: <IUser /> },
] as const;

/** Compact language picker (flexworkers: NL/EN/PL/RO/UK). */
function LanguageButton() {
  const { locale } = useI18n();
  const t = useFT();
  return (
    <label className="relative grid h-11 w-11 place-items-center rounded-lg border border-hairstrong text-neutralx-500 transition hover:text-ink" title={t.lang.label}>
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
  children,
}: {
  userName: string;
  /** Eigen profielfoto — toont in de Account-tab i.p.v. het poppetje-icoon. */
  avatarUrl?: string | null;
  theme: Theme;
  /** Android app: no Bank tab (lib/app-mode.ts) */
  inApp?: boolean;
  children: ReactNode;
}) {
  const tabs = inApp ? TABS.filter((t) => t.key !== "bank") : TABS;
  const pathname = usePathname();
  const ft = useFT();
  const isActive = (href: string) =>
    pathname === href ||
    pathname.startsWith(href + "/") ||
    // "/dashboard" root and shift detail count as Ontdekken
    (href === "/dashboard/klussen" && (pathname === "/dashboard" || pathname.startsWith("/dashboard/klussen")));

  // Focused full-screen views (a single klus) hide the tab bar so a page-owned
  // action bar can take its place.
  const focused = /^\/dashboard\/klussen\/[^/]+$/.test(pathname);
  const current = tabs.find((t) => isActive(t.href));
  const title = !current || current.href === "/dashboard/klussen" ? ft.nav.findJob : ft.nav[current.key];

  return (
    <div data-theme={theme} className="app-scope app-bg noise flex min-h-screen flex-col bg-paper-soft">
      {/* Top bar */}
      {!focused && (
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-hair bg-white/85 px-4 backdrop-blur-xl lg:px-8">
          <Link href="/dashboard/klussen" className="font-display text-base font-bold tracking-tight text-ink">
            {title}
            <span className="mt-0.5 block h-1 w-16 rounded-full bg-gradient-to-r from-crit to-crit/40" />
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <LanguageButton />
            <ThemeToggle
              theme={theme}
              className="grid h-11 w-11 place-items-center rounded-lg border border-hairstrong text-neutralx-500 transition hover:text-ink"
            />
            <Link
              href="/dashboard/klussen"
              aria-label={ft.nav.search}
              className="grid h-11 w-11 place-items-center rounded-lg border border-hairstrong text-neutralx-500 transition hover:text-ink"
            >
              <ISearch />
            </Link>
            <NotificationsBell />
          </div>
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
          {!focused && !pathname.startsWith("/dashboard/berichten") && <PushToggle variant="banner" />}
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

      <span className="sr-only">Ingelogd als {userName}</span>
    </div>
  );
}
