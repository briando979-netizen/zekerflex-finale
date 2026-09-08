"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { NotificationsBell } from "@/components/app/NotificationsBell";
import { ICompass, IBriefcase, IClock, IChat, IUser, ISearch } from "@/components/app/icons";

// ---------------------------------------------------------------------------
// Freelancer workspace shell — YoungOnes-style: a slim top bar and a
// 5-item bottom navigation (full-width bar on mobile, a floating pill on
// desktop). No left sidebar.
// ---------------------------------------------------------------------------

const TABS = [
  { href: "/dashboard/klussen", label: "Ontdekken", icon: <ICompass /> },
  { href: "/dashboard/diensten", label: "Mijn klussen", icon: <IBriefcase /> },
  { href: "/dashboard/uren", label: "Uren invullen", icon: <IClock /> },
  { href: "/dashboard/berichten", label: "Chat", icon: <IChat /> },
  { href: "/dashboard/account", label: "Account", icon: <IUser /> },
];

export function FreelancerShell({
  userName,
  children,
}: {
  userName: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href ||
    pathname.startsWith(href + "/") ||
    // "/dashboard" root and shift detail count as Ontdekken
    (href === "/dashboard/klussen" && (pathname === "/dashboard" || pathname.startsWith("/dashboard/klussen")));

  // Focused full-screen views (a single klus) hide the tab bar so a page-owned
  // action bar can take its place.
  const focused = /^\/dashboard\/klussen\/[^/]+$/.test(pathname);

  return (
    <div className="app-bg noise flex min-h-screen flex-col bg-paper-soft">
      {/* Top bar */}
      {!focused && (
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-hair bg-white/85 px-4 backdrop-blur-xl lg:px-8">
          <Link href="/dashboard/klussen" className="font-display text-base font-bold tracking-tight text-ink">
            Vind jouw klus
            <span className="mt-0.5 block h-1 w-16 rounded-full bg-gradient-to-r from-crit to-crit/40" />
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/dashboard/klussen"
              aria-label="Zoeken"
              className="grid h-9 w-9 place-items-center rounded-lg border border-hairstrong text-neutralx-500 transition hover:text-ink"
            >
              <ISearch />
            </Link>
            <NotificationsBell />
          </div>
        </header>
      )}

      <main
        key={pathname}
        className={`relative flex-1 animate-slide-up-fade ${
          focused ? "" : "px-4 pb-28 pt-6 lg:px-8"
        }`}
      >
        <div className={focused ? "" : "mx-auto max-w-3xl"}>{children}</div>
      </main>

      {/* Bottom navigation */}
      {!focused && (
      <nav
        aria-label="Hoofdnavigatie"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-hair bg-white/95 backdrop-blur-xl lg:inset-x-auto lg:bottom-4 lg:left-1/2 lg:-translate-x-1/2 lg:rounded-full lg:border lg:border-hair lg:px-2 lg:shadow-lift"
      >
        <ul className="mx-auto flex max-w-lg items-stretch justify-between lg:max-w-none lg:gap-1">
          {TABS.map((t) => {
            const active = isActive(t.href);
            return (
              <li key={t.href} className="flex-1 lg:flex-none">
                <Link
                  href={t.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex flex-col items-center gap-0.5 px-2 py-2.5 text-[11px] font-medium transition lg:flex-row lg:gap-2 lg:rounded-full lg:px-4 lg:py-2.5 ${
                    active
                      ? "text-brand-600 lg:bg-ink lg:text-white"
                      : "text-neutralx-400 hover:text-neutralx-600 lg:hover:bg-paper-soft"
                  }`}
                  title={t.label}
                >
                  <span className="grid h-5 w-5 place-items-center">{t.icon}</span>
                  <span className={active ? "" : "lg:hidden"}>{t.label}</span>
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
